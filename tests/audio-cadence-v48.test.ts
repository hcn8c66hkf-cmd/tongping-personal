import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("v49 audio server credit window spans realistic websocket RTT", () => {
  const hub = fs.readFileSync(
    new URL("../src/audio-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /const MAX_APP_CREDITS = 128/);
});

test("v49 app never rewinds audioNextTime over already scheduled audio", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /AUDIO_TARGET_AHEAD = 0\.28/);
  assert.match(app, /AUDIO_MAX_AHEAD = 0\.62/);
  assert.match(app, /function resetAudioSchedule/);
  assert.match(app, /audioScheduledSources/);
  assert.match(app, /gapPackets > AUDIO_MAX_SMALL_GAP_PACKETS/);
  assert.match(app, /source\.connect\(gain\)/);
  assert.doesNotMatch(
    app,
    /audioNextTime - now > 0\.8[\s\S]{0,250}audioNextTime = now \+ 0\.18/,
  );
});

test("v49 media lane uses short chunks and gentle bounded catch-up", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /recorder\.start\(chunkMs\)/);
  assert.match(manager, /options\.chunkMs \?\? 250/);
  assert.match(app, /lag > 1\.35/);
  assert.match(app, /video\.playbackRate = 1\.05/);
  assert.match(app, /video\.playbackRate = 1\.025/);
  assert.match(app, /lag > 2\.4/);
});

test("v49 forces a fresh MCP App resource instead of cached v38 UI", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /shared-browser-v100/);
});
