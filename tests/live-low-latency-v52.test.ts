import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("v52 uses a single in-flight latest-frame window", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /const MAX_LIVE_IN_FLIGHT = 1/);
  assert.match(worker, /state\.lastFrameBytes = frame\.buffer\.length/);
  assert.match(worker, /lastFrameBytes: state\.lastFrameBytes/);
});

test("v52 realtime screencast is lighter for constrained uplinks", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /quality: 28/);
  assert.match(manager, /maxWidth: 640/);
  assert.match(manager, /maxHeight: 360/);
});
