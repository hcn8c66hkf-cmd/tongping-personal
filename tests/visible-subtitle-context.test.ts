import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("media context only falls back to visible subtitle DOM inside active media", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /visible-subtitle-dom/);
  assert.match(manager, /centerX >= mediaRect\.left/);
  assert.match(manager, /centerY >= mediaRect\.top/);
  assert.match(manager, /transcript\|history\|list/);
  assert.match(manager, /recordObservedSubtitle/);
  assert.match(manager, /startTime: cutoff/);
  assert.match(manager, /endTime: cutoff/);
  assert.match(manager, /gateSubtitleCues\(\s*visibleDomHistory/);
  assert.match(manager, /textTrackCues\.length === 0/);
});
