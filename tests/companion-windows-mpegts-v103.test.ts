import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  companionUsesMpegTs,
  DelayedCompanionHls,
} from "../src/delayed-companion-hls.js";

test("Windows companion HLS avoids the live fMP4 init-file stall", () => {
  assert.equal(companionUsesMpegTs("win32"), true);
  assert.equal(companionUsesMpegTs("linux"), false);

  const hls = fs.readFileSync(
    new URL("../src/delayed-companion-hls.ts", import.meta.url),
    "utf8",
  );
  assert.match(hls, /useMpegTs \? "mpegts" : "fmp4"/);
  assert.match(hls, /useMpegTs \? "ts" : "m4s"/);

  const daemon = fs.readFileSync(
    new URL("../src/daemon.ts", import.meta.url),
    "utf8",
  );
  assert.match(daemon, /name\.endsWith\("\.ts"\) \? "video\/mp2t" : "video\/mp4"/);

  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /m4s\|ts/);
});

test("MPEG-TS companion mode publishes a playable live playlist", async (t) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    t.skip("ffmpeg is unavailable");
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tongping-mpegts-"));
  const input = path.join(root, "source.webm");
  const generated = spawnSync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=20:duration=10",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10",
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libvpx", "-b:v", "120k", "-g", "40",
    "-c:a", "libopus", "-y", input,
  ], { encoding: "utf8", timeout: 20_000 });
  assert.equal(generated.status, 0, generated.stderr);

  const previous = process.env.TONGPING_COMPANION_HLS_MPEGTS;
  process.env.TONGPING_COMPANION_HLS_MPEGTS = "1";
  const hls = new DelayedCompanionHls(root);
  try {
    await hls.start("test", "mpegts", "video/webm;codecs=vp8,opus");
    hls.write("test", "mpegts", fs.readFileSync(input));
    const playlistPath = path.join(root, "test", "index.m3u8");
    let playlist = "";
    for (let index = 0; index < 200; index += 1) {
      playlist = fs.existsSync(playlistPath)
        ? fs.readFileSync(playlistPath, "utf8")
        : "";
      if ((playlist.match(/^#EXTINF:/gm) ?? []).length >= 4) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(playlist, /\.ts(?:\r?\n|$)/);
    assert.doesNotMatch(playlist, /#EXT-X-MAP:/);
    assert.ok(await hls.bufferedSeconds("test") >= 7.5);
  } finally {
    await hls.close();
    if (previous === undefined) delete process.env.TONGPING_COMPANION_HLS_MPEGTS;
    else process.env.TONGPING_COMPANION_HLS_MPEGTS = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
