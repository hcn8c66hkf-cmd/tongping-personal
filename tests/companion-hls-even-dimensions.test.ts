import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COMPANION_VIDEO_FILTER } from "../src/delayed-companion-hls.js";

const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");

test("companion HLS pads odd capture dimensions before yuv420p/libx264", () => {
  assert.ok(
    COMPANION_VIDEO_FILTER.endsWith(
      "scale=w=1280:h=-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
    ),
  );
  assert.ok(hls.includes('"-vf", COMPANION_VIDEO_FILTER,'));
  assert.ok(hls.includes('"-pix_fmt", "yuv420p"'));
  assert.ok(hls.includes('"-c:v", "libx264"'));
});
