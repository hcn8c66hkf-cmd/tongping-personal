import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DelayedCompanionHls } from "../src/delayed-companion-hls.js";

test("15fps tab capture keeps real-time video length, even across a PTS jump", async (t) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    t.skip("ffmpeg is unavailable");
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tongping-vfr-"));
  const input = path.join(root, "vfr.webm");
  const hls = new DelayedCompanionHls(root);
  try {
    const generated = spawnSync("ffmpeg", [
      "-v", "error",
      "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=15:duration=10",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10",
      "-filter_complex",
      "[0:v]setpts=PTS+if(gte(T\\,5)\\,300/TB\\,0)[v];[1:a]asetpts=PTS+if(gte(T\\,5)\\,300/TB\\,0)[a]",
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libvpx", "-b:v", "90k", "-c:a", "libopus",
      "-y", input,
    ], { encoding: "utf8", timeout: 20_000 });
    assert.equal(generated.status, 0, generated.stderr);
    await hls.start("test", "vfr", "video/webm;codecs=vp8,opus");
    hls.write("test", "vfr", fs.readFileSync(input));
    // Let the transcode drain before stopping: stop() only grants ffmpeg a
    // short grace period, which a loaded 1-core box can overrun.
    const pending = path.join(root, "test", "index.m3u8");
    for (let i = 0; i < 300; i++) {
      const text = fs.existsSync(pending) ? fs.readFileSync(pending, "utf8") : "";
      const sum = [...text.matchAll(/^#EXTINF:([0-9.]+)/gm)]
        .reduce((total, match) => total + Number(match[1]), 0);
      if (sum >= 7.9) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await hls.stop("test");
    const playlist = path.join(root, "test", "index.m3u8");
    for (let i = 0; i < 300; i++) {
      const exits = hls.status().recentExits as Array<{ streamId: string }>;
      if (exits.some((exit) => exit.streamId === "vfr")) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(fs.existsSync(playlist), "ffmpeg produced an HLS playlist");
    const total = [...fs.readFileSync(playlist, "utf8").matchAll(/^#EXTINF:([0-9.]+)/gm)]
      .reduce((sum, match) => sum + Number(match[1]), 0);
    assert.ok(total > 9 && total < 11.5,
      "ten seconds of 15fps capture must stay about ten seconds of video; got " + total);
  } finally {
    await hls.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
