import assert from "node:assert/strict";
import test from "node:test";

import { isCopyableCompanionMime } from "../src/delayed-companion-hls.js";

test("companion HLS re-encodes by default so input keyframe stalls cannot pin cache at zero", () => {
  const previous = process.env.TONGPING_COMPANION_VIDEO_COPY_WEBM;
  try {
    delete process.env.TONGPING_COMPANION_VIDEO_COPY_WEBM;
    assert.equal(isCopyableCompanionMime("video/webm;codecs=h264,opus"), false);
    process.env.TONGPING_COMPANION_VIDEO_COPY_WEBM = "1";
    assert.equal(isCopyableCompanionMime("video/webm;codecs=h264,opus"), true);
  } finally {
    if (previous === undefined) {
      delete process.env.TONGPING_COMPANION_VIDEO_COPY_WEBM;
    } else {
      process.env.TONGPING_COMPANION_VIDEO_COPY_WEBM = previous;
    }
  }
});
