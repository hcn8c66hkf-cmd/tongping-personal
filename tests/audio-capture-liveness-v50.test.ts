import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("v50 audio capture liveness requires recent PCM, not just a controller shell", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /startedAt: number/);
  assert.match(manager, /lastChunkAt: number/);
  assert.match(manager, /current\.lastChunkAt = capturedAt/);
  assert.match(manager, /Date\.now\(\) - freshnessAnchor > 3_000/);
  assert.match(manager, /Boolean\(root\.__tongpingAudioController\)/);
});

test("v50 stale audio capture is torn down before a replacement helper is created", () => {
  const service = fs.readFileSync(
    new URL("../src/browser-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    service,
    /if \(existing\) \{\s*await this\.browsers\.stopLiveAudio\(profile\)/,
  );
  assert.match(service, /this\.audioCaptureInfo\.delete\(profile\)/);
  assert.match(service, /this\.browsers\.startLiveAudio/);
});

test("v50 worker package carries the audio liveness repair", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /const WORKER_BUILD = "v95"/);
});
