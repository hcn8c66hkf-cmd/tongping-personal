import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("page-side subtitle recorder samples current visible text locally", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /__tongpingSubtitleRecorder/);
  assert.match(manager, /window\.setInterval\(recorder\.sample, 250\)/);
  assert.match(manager, /visibleSubtitleFor\(activeMedia\)/);
  assert.match(manager, /track: "visible-dom-observed"/);
  assert.match(manager, /location\.href/);
  assert.match(manager, /mediaTime - 3_600/);
  assert.match(manager, /slice\(-2_000\)/);
});

test("model-facing DOM history still passes timestamp gate", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /chosen\.observedCues\.length > 0/);
  assert.match(manager, /gateSubtitleCues\(\s*visibleDomHistory/);
});
