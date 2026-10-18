import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPANION_AUDIO_FILTER,
  COMPANION_COPY_VIDEO_BSF,
  COMPANION_VIDEO_FILTER,
} from "../src/delayed-companion-hls.js";

test("companion A/V filters do not preserve arbitrary recorder start PTS", () => {
  assert.doesNotMatch(COMPANION_VIDEO_FILTER, /eq\(N,0\),PTS\+/);
  assert.doesNotMatch(COMPANION_COPY_VIDEO_BSF, /eq\(N\\,0\)\\,PTS\+/);
  assert.equal(COMPANION_AUDIO_FILTER, "asetpts=N/SR/TB");
  assert.match(COMPANION_VIDEO_FILTER, /eq\(N,0\),0\.150\/TB/);
});
