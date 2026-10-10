import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserLiveUrl,
  createBrowserWatchCollectionUrl,
  createBrowserWatchCollectionWriteUrl,
  deriveBrowserAppSigningKey,
  verifyBrowserLiveTicket,
  verifyBrowserWatchCollectionTicket,
} from "../src/browser-app-ticket.js";

test("live, collection read, and collection write have separate authority", () => {
  const key = deriveBrowserAppSigningKey("synthetic-ticket-key");
  const now = 1_800_000_000_000;
  const urls = {
    live: new URL(createBrowserLiveUrl("https://browser.example.test", key, "default", 900, now)),
    read: new URL(createBrowserWatchCollectionUrl("https://browser.example.test", key, "default", 900, now)),
    write: new URL(createBrowserWatchCollectionWriteUrl("https://browser.example.test", key, "default", 900, now)),
  };
  const query = (url: URL) => [url.searchParams.get("exp"), url.searchParams.get("sig")] as const;
  const [liveExp, liveSig] = query(urls.live);
  const [readExp, readSig] = query(urls.read);
  const [writeExp, writeSig] = query(urls.write);
  assert.equal(verifyBrowserLiveTicket(key, "default", liveExp, liveSig, now), true);
  assert.equal(verifyBrowserWatchCollectionTicket(key, "default", "read", readExp, readSig, now), true);
  assert.equal(verifyBrowserWatchCollectionTicket(key, "default", "write", writeExp, writeSig, now), true);
  for (const [exp, sig] of [[liveExp, liveSig], [writeExp, writeSig]] as Array<[string | null, string | null]>) {
    assert.equal(verifyBrowserWatchCollectionTicket(key, "default", "read", exp, sig, now), false);
  }
  for (const [exp, sig] of [[liveExp, liveSig], [readExp, readSig]] as Array<[string | null, string | null]>) {
    assert.equal(verifyBrowserWatchCollectionTicket(key, "default", "write", exp, sig, now), false);
  }
  assert.equal(verifyBrowserLiveTicket(key, "default", readExp, readSig, now), false);
  assert.equal(verifyBrowserLiveTicket(key, "default", writeExp, writeSig, now), false);
  assert.equal(verifyBrowserWatchCollectionTicket(key, "other", "read", readExp, readSig, now), false);
  assert.equal(verifyBrowserWatchCollectionTicket(key, "default", "read", readExp, readSig, now + 901_000), false);
});
