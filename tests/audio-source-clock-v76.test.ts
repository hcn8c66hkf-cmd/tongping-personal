import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");

test("tab-output audio chunks carry the on-screen video's clock, not AudioContext uptime", () => {
  assert.match(manager, /if \(current\.capturePage\) \{\n            this\.ensureAudioSourceClock\(normalized\);/);
  assert.match(manager, /clock\.pts \+ \(\(capturedAt - clock\.at\) \/ 1000\) \* clock\.rate/);
  assert.match(manager, /const reading = await this\.readMediaClock\(profile\)\.catch\(\(\) => null\);/);
  // Poller stops with the capture.
  assert.match(manager, /if \(!this\.liveAudioCaptures\.get\(profile\) && !this\.liveMediaCaptures\.get\(profile\)\) \{\n        const timer = this\.audioSourceClockPollers\.get\(profile\);\n        if \(timer\) clearInterval\(timer\);/);
});
