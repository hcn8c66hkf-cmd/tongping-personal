import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name: string) =>
  fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("every companion playlist request names its watch session", () => {
  const app = read("browser-app.ts");
  const fn = app.slice(
    app.indexOf("function companionPlaylistUrl() {"),
    app.indexOf("function companionPlaybackWaitUrl() {"),
  );
  assert.match(fn, /url\.searchParams\.set\("entry", String\(companionStartedAt\)\)/);
  // The wait URL is built from the playlist URL, so it carries it too.
  assert.match(app, /function companionPlaybackWaitUrl\(\) \{\n  const base = companionPlaylistUrl\(\);/);
  // companionStartedAt is set before the first playlist URL is built.
  const toggle = app.slice(app.indexOf("async function toggleCompanionMode() {"));
  assert.ok(
    toggle.indexOf("companionStartedAt = Date.now();") <
      toggle.indexOf("video.src = companionPlaybackWaitUrl();"),
  );
});

test("the playlist endpoint records the entry and ignores older cards", () => {
  const daemon = read("daemon.ts");
  const handler = daemon.slice(daemon.indexOf('url.pathname === "/v1/app/companion-hls"'));
  assert.ok(
    handler.indexOf("noteCompanionEntry(profile, entryParam);") <
      handler.indexOf("await delayedCompanionHls.playlist("),
  );
  assert.match(daemon, /Number\(entry\) < Number\(current\)/);
});
