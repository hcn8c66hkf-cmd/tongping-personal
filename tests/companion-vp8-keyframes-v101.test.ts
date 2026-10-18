import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("VP8 companion capture is capped at 720p and requests two-second keyframes", () => {
  const source = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(tracks\[0\]\) \{[\s\S]*?applyConstraints\(\{ width: \{ max: 1280 \}, height: \{ max: 720 \}/);
  assert.match(source, /videoKeyFrameIntervalDuration:\s*2000/);
  assert.doesNotMatch(source, /mimeType\.includes\("h264"\)\s*\?\s*\{ videoKeyFrameIntervalDuration/);
});
