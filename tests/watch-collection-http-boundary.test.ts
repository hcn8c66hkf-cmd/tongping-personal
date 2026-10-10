import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createBrowserLiveUrl,
  createBrowserWatchCollectionUrl,
  createBrowserWatchCollectionWriteUrl,
  deriveBrowserAppSigningKey,
} from "../src/browser-app-ticket.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test("daemon collection HTTP routes require read or write tickets by method", { timeout: 45_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-collection-http-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const token = "synthetic-daemon-token-for-isolated-http-test";
  const key = deriveBrowserAppSigningKey(token);
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TONGPING_HOME: root,
      TONGPING_WATCH_COLLECTION_ROOT: path.join(root, "collections"),
      TONGPING_TOKEN: token,
      TONGPING_HOST: "127.0.0.1",
      TONGPING_PORT: String(port),
      TONGPING_HEADLESS: "1",
      TONGPING_REMOTE_WORKER: "0",
    },
    stdio: "ignore",
  });
  const read = createBrowserWatchCollectionUrl(origin, key, "default", 900);
  const write = createBrowserWatchCollectionWriteUrl(origin, key, "default", 900);
  const live = createBrowserLiveUrl(origin, key, "default", 900).replace(/^ws:/, "http:").replace("/v1/app/live-ws", "/v1/app/watch-collection");
  const collectionId = "syntheticCollectionId1234567890";
  const collectionUrl = (raw: string) => `${raw}&collectionId=${collectionId}`;
  const post = (raw: string, body: Record<string, unknown>) => fetch(raw, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectionId, ...body }),
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) break;
      try { healthy = (await fetch(origin + "/health")).ok; } catch {}
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.equal(healthy, true, "isolated daemon did not start");
    assert.equal((await post(live, { action: "enable" })).status, 403);
    assert.equal((await post(read, { action: "enable" })).status, 403);
    assert.equal((await fetch(collectionUrl(write))).status, 403);
    assert.equal((await post(write, { action: "enable" })).status, 200);
    assert.equal((await fetch(collectionUrl(read))).status, 200);

    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=";
    const added = await post(write, { action: "add", ticket: {
      id: "syntheticTicket123", title: "fixture", platform: "test", url: "https://example.test/",
      watchedAt: new Date().toISOString(), imageMimeType: "image/png", imageBase64: png,
    } });
    assert.equal(added.status, 200);
    const payload = await added.json() as { collection: { tickets: Array<{ imageUrl: string }> } };
    assert(payload.collection.tickets.length > 0);
    const imageUrl = new URL(payload.collection.tickets[0]!.imageUrl, origin);
    assert.equal((await fetch(imageUrl)).status, 200);
    const transplanted = new URL(imageUrl);
    transplanted.searchParams.set("sig", new URL(write).searchParams.get("sig")!);
    transplanted.searchParams.set("exp", new URL(write).searchParams.get("exp")!);
    assert.equal((await fetch(transplanted)).status, 403);
    const expiredRead = createBrowserWatchCollectionUrl(origin, key, "default", 900, Date.now() - 901_000);
    assert.equal((await fetch(collectionUrl(expiredRead))).status, 403);
    const renewedRead = createBrowserWatchCollectionUrl(origin, key, "default", 900, Date.now() + 30_000);
    assert.notEqual(new URL(renewedRead).searchParams.get("sig"), new URL(read).searchParams.get("sig"));
    assert.equal((await fetch(collectionUrl(renewedRead))).status, 200);
  } finally {
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
