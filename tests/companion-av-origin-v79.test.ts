import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  COMPANION_AUDIO_FILTER,
  COMPANION_VIDEO_FILTER,
} from "../src/delayed-companion-hls.js";

// Run the real HLS transcode filters so the A/V start offset can be checked
// without a full HLS session.
const videoFilter = COMPANION_VIDEO_FILTER.split(",scale=")[0]!;
const audioFilter = COMPANION_AUDIO_FILTER;
const videoDelay = Number(COMPANION_VIDEO_FILTER.match(/PTS\+([0-9.]+)\/TB/)![1]);

test("video that starts after audio keeps that offset instead of leading the sound", (t) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    t.skip("ffmpeg is unavailable");
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tongping-av-"));
  try {
    const input = path.join(root, "offset.webm");
    const output = path.join(root, "out.mp4");
    const made = spawnSync("ffmpeg", [
      "-v", "error",
      "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=15:duration=6",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6.5",
      "-filter_complex", "[0:v]setpts=PTS+0.5/TB[v]",
      "-map", "[v]", "-map", "1:a",
      "-c:v", "libvpx", "-b:v", "90k", "-c:a", "libopus", "-y", input,
    ], { encoding: "utf8", timeout: 20_000 });
    assert.equal(made.status, 0, made.stderr);
    const run = spawnSync("ffmpeg", [
      "-v", "error", "-fflags", "+genpts+discardcorrupt", "-i", input,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", videoFilter, "-af", audioFilter, "-r", "20",
      "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
      "-f", "mp4", "-y", output,
    ], { encoding: "utf8", timeout: 20_000 });
    assert.equal(run.status, 0, run.stderr);
    const probe = spawnSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type,duration",
      "-of", "csv=p=0", output,
    ], { encoding: "utf8" });
    const durations = Object.fromEntries(
      probe.stdout.trim().split("\n").map((line) => {
        const [type, value] = line.split(",");
        return [type, Number(value)];
      }),
    );
    // The half-second lead-in must stay in the video track (held first
    // frame), so both tracks end together as in the source, apart from the
    // deliberate capture-latency hold on the picture.
    assert.ok(
      Math.abs(durations.video! - durations.audio! - videoDelay) < 0.15,
      "video " + durations.video + " vs audio " + durations.audio,
    );
    assert.ok(videoDelay > 0 && videoDelay < 0.5);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
