import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("visible DOM subtitles accumulate only observed local history", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /observedSubtitleHistory/);
  assert.match(manager, /recordObservedSubtitle/);
  assert.match(manager, /visible-dom-observed/);
  assert.match(manager, /visible-subtitle-dom-history/);
  assert.match(manager, /gateSubtitleCues\(\s*visibleDomHistory/);
  assert.match(manager, /state\.mediaKey !== mediaKey/);
  assert.match(manager, /cutoff - 3_600/);
  assert.match(manager, /slice\(-2_000\)/);
});

test("observed subtitle cache clears with profile lifecycle", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /observedSubtitleHistory\.delete\(normalized\)/);
  assert.match(manager, /observedSubtitleHistory\.clear\(\)/);
});
