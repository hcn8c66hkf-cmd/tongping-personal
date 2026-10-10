import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("v35 audio capture prefers browser tab output with media fallback", async () => {
  const manager = await readFile(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    manager,
    /--auto-select-tab-capture-source-by-title=TongPing Audio Source/,
  );
  assert.match(manager, /navigator\.mediaDevices\.getDisplayMedia/);
  assert.match(manager, /suppressLocalAudioPlayback:\s*false/);
  assert.match(manager, /restrictOwnAudio:\s*false/);
  assert.match(manager, /captureMode:\s*"tab-output"/);
  assert.match(manager, /capture-helper/);
  assert.match(manager, /helperPage\.evaluate/);
  assert.match(manager, /preferCurrentTab:\s*false/);

  // Site-specific DOM capture remains only as a fallback.
  assert.match(manager, /page\.frames\(\)/);
  assert.match(manager, /querySelectorAll<HTMLMediaElement>\("video, audio"\)/);
  assert.match(manager, /audioFrame\.evaluate/);
  assert.match(manager, /!element\.paused && element\.readyState >= 2/);
});
