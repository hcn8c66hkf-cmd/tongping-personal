import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("audio uses the presented live-frame capturedAt as its presentation clock", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /let liveRenderedAtMs = 0/);
  assert.match(app, /liveRenderedAtMs = Date\.now\(\)/);
  assert.match(app, /function presentationSourceNowMs\(\)/);
  assert.match(app, /function desiredAudioAheadSeconds\(capturedAt\)/);
  assert.match(app, /view\.getUint32\(16\) \* 4294967296 \+ view\.getUint32\(20\)/);
  assert.match(app, /desiredStart - audioNextTime/);
  assert.match(app, /AV_SYNC_HARD_RESET_MS = 280/);
  assert.match(app, /AV_SYNC_NUDGE_PER_PACKET = 0\.018/);
});

test("audio sync telemetry reports the shared presentation clock", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  const hub = fs.readFileSync(
    new URL("../src/audio-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /presentationClock: presentationSourceNowMs\(\) !== null/);
  assert.match(app, /syncErrorMs: audioSyncErrorMs/);
  assert.match(hub, /presentationClock: boolean/);
  assert.match(hub, /syncErrorMs: number/);
});

test("shared clock ships under a fresh MCP App resource identity", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /shared-browser-v97/);
});
