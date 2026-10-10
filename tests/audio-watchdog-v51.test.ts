import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("v51 worker automatically restarts audio capture after a PCM stall", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /const audioHealth = new Map/);
  assert.match(worker, /now - health\.lastChunkAt < 3_000/);
  assert.match(worker, /live audio watchdog restart:/);
  assert.match(worker, /await service\.stopLiveAudio\(profile\)/);
  assert.match(worker, /await ensureAudio\(profile\)/);
  assert.match(worker, /health\.lastChunkAt = Date\.now\(\)/);
  assert.match(worker, /health\.armed = true/);
  assert.match(worker, /clearInterval\(audioWatchdog\)/);
});

test("stopping audio also clears watchdog state", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    worker,
    /async function stopAudio[\s\S]*audioStarted\.delete\(profile\);[\s\S]*audioHealth\.delete\(profile\);/,
  );
});
