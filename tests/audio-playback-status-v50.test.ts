import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("audio app reports playback-context state and PCM level to the server", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  const hub = fs.readFileSync(
    new URL("../src/audio-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /type: "audio_status"/);
  assert.match(app, /contextState: audioContext/);
  assert.match(app, /scheduledAheadMs:/);
  assert.match(app, /pcmRms: audioLastPcmRms/);
  assert.match(app, /audioPacketsReceived \+= 1/);
  assert.match(app, /Math\.sqrt\(sumSquares/);
  assert.match(hub, /message\.type === "audio_status"/);
  assert.match(hub, /appPlaybackStatus/);
  assert.match(hub, /appStatusReports/);
});

test("fresh playback diagnostics use a new app resource identity", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /shared-browser-v102/);
});
