import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const relay = fs.readFileSync(new URL("../src/worker-relay.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("media teardown bounds source-page keepalive cleanup", () => {
  const start = manager.indexOf("async stopLiveMedia(profile: string)");
  const end = manager.indexOf("async listProfiles()", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("await Promise.race(["));
  assert.ok(block.includes("__tongpingCompanionKeepalive"));
  assert.ok(block.includes("setTimeout(resolve, 500)"));
  assert.ok(block.includes("setTimeout(resolve, 900)"));
  assert.ok(block.includes("setTimeout(resolve, 1200)"));
});

test("human_media_restart gets a 60 second real-result envelope", () => {
  assert.ok(relay.includes('action === "human_media_restart"'));
  assert.ok(relay.includes("Math.max(this.timeoutMs, 60_000)"));
  const start = worker.indexOf('command.action === "human_media_restart"');
  const end = worker.indexOf('command.action === "human_media_stop"', start);
  const block = worker.slice(start, end);
  assert.ok(block.includes("await stopMedia(profile)"));
  assert.ok(block.includes("const result = await ensureMedia(profile, mode)"));
  assert.ok(block.includes("...result"));
  assert.ok(!block.includes("pending: true"));
});

test("worker build is v79 for bounded media restart", () => {
  assert.ok(worker.includes('const WORKER_BUILD = "v95"'));
});
