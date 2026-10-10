import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("v50 live frame pump paces at 20fps and selects latest after waiting", () => {
  const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /50 - \(Date\.now\(\) - state\.lastSentAt\)/);
  const waitAt = worker.indexOf("if (waitMs > 0) await sleep(waitMs)");
  const takeAt = worker.indexOf("const frame = state.latest", waitAt);
  assert.ok(waitAt >= 0 && takeAt > waitAt);
  assert.match(worker, /const MAX_LIVE_IN_FLIGHT = 1/);
  assert.match(worker, /LIVE_FRAME_ACK_TIMEOUT_MIN_MS = 10_000/);
  assert.match(worker, /LIVE_FRAME_ACK_TIMEOUT_MAX_MS = 30_000/);
  assert.match(worker, /LIVE_FRAME_ACK_TIMEOUT_MULTIPLIER = 6/);
  assert.match(worker, /currentLiveFrameAckTimeoutMs/);
  assert.match(worker, /state\.inFlight\.size >= MAX_LIVE_IN_FLIGHT/);
  assert.match(worker, /message\.type === "frame_received"/);
  assert.match(worker, /socket\.bufferedAmount > 96_000/);
});
