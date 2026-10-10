import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DelayedCompanionHls,
  sourcePtsAt,
  sourceSampleAt,
  type CompanionSourceTimelineAnchor,
} from "../src/delayed-companion-hls.js";

const sample = (
  wallClockMs: number,
  sourcePts: number,
  sourceDuration: number | null,
  playbackRate = 1,
  mediaKey = "a",
): CompanionSourceTimelineAnchor => ({
  wallClockMs, sourcePts, sourceDuration, playbackRate, mediaKey,
});

test("a looping clip maps back to its start instead of running past its length", () => {
  // 30s clip, sampled every 3s; it loops at wall 30s.
  const samples = [sample(0, 0, 30), sample(27_000, 27, 30), sample(30_500, 0.5, 30)];
  assert.equal(sourcePtsAt(sourceSampleAt(samples, 29_000)!, 29_000), 29);
  // Between the last pre-loop sample and the loop, time clamps at the length.
  assert.equal(sourcePtsAt(sourceSampleAt(samples, 30_400)!, 30_400), 30);
  assert.equal(sourcePtsAt(sourceSampleAt(samples, 33_000)!, 33_000), 3);
});

test("a switched video takes the new duration and a paused source stands still", () => {
  const samples = [
    sample(0, 100, 2767.8),
    sample(3_000, 5, 45, 1, "b"),
    sample(6_000, 8, 45, 0, "b"),
  ];
  assert.equal(sourceSampleAt(samples, 4_000)!.sourceDuration, 45);
  assert.equal(sourcePtsAt(sourceSampleAt(samples, 4_000)!, 4_000), 6);
  assert.equal(sourcePtsAt(sourceSampleAt(samples, 20_000)!, 20_000), 8);
  // Before the first sample, the first sample is still the best estimate.
  assert.equal(sourceSampleAt(samples, -5_000)!.sourcePts, 100);
});

test("re-entering companion drops segments captured before the entry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tongping-entry-"));
  const hls = new DelayedCompanionHls(root);
  try {
    const dir = path.join(root, "test");
    fs.mkdirSync(dir, { recursive: true });
    const base = Date.parse("2026-09-25T07:00:00.000Z");
    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      "#EXT-X-TARGETDURATION:2",
      "#EXT-X-MEDIA-SEQUENCE:100",
      '#EXT-X-MAP:URI="init_old.mp4"',
      "#EXT-X-DISCONTINUITY",
    ];
    for (let i = 0; i < 30; i++) {
      if (i === 10) {
        lines.push('#EXT-X-MAP:URI="init_new.mp4"', "#EXT-X-DISCONTINUITY");
      }
      lines.push(
        "#EXTINF:2.000000,",
        "#EXT-X-PROGRAM-DATE-TIME:" + new Date(base + i * 2000).toISOString(),
        "seg_" + (i < 10 ? "old" : "new") + "_" + String(100 + i).padStart(10, "0") + ".m4s",
      );
    }
    fs.writeFileSync(path.join(dir, "index.m3u8"), lines.join("\n") + "\n");
    // Files finish on the wall clock, which runs 45s ahead of the stalled
    // PROGRAM-DATE-TIME here: the entry cutoff must follow the files.
    const drift = 45_000;
    for (let i = 0; i < 30; i++) {
      const name = "seg_" + (i < 10 ? "old" : "new") + "_" + String(100 + i).padStart(10, "0") + ".m4s";
      const file = path.join(dir, name);
      fs.writeFileSync(file, "");
      const endSeconds = (base + (i + 1) * 2000 + drift) / 1000;
      fs.utimesSync(file, endSeconds, endSeconds);
    }

    // Entry after segment 11 was written: segments 0..11 are the old session.
    const entryAt = base + 12 * 2000 + drift;
    assert.equal(await hls.bufferedSeconds("test"), 60);
    assert.equal(await hls.bufferedSeconds("test", entryAt), 36);

    const playlist = await hls.playlist("test", 8, "p=test", entryAt);
    assert.ok(playlist);
    assert.match(playlist, /#EXT-X-MEDIA-SEQUENCE:112/);
    assert.match(playlist, /init_new\.mp4/);
    assert.doesNotMatch(playlist, /init_old\.mp4/);
    assert.doesNotMatch(playlist, /seg_old_/);
    assert.doesNotMatch(playlist, /seg_new_0000000111/);
    assert.match(playlist, /seg_new_0000000112/);

    const unfiltered = await hls.playlist("test", 8, "p=test");
    assert.match(unfiltered!, /seg_old_0000000100/);
  } finally {
    await hls.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v79 app reads per-sample source clocks and announces its companion entry", () => {
  const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
  assert.match(app, /#TONGPING-SOURCE-SAMPLE:/);
  assert.match(app, /function applyCompanionSourceSample/);
  assert.match(app, /entry: companionModeActive \? String\(companionStartedAt/);
  const hub = fs.readFileSync(new URL("../src/media-ws-hub.ts", import.meta.url), "utf8");
  assert.match(hub, /onCompanionReady\?\.\(profile, entry\)/);
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
  assert.match(daemon, /noteCompanionEntry\(profile, entry\)/);
  assert.match(daemon, /delayedCompanionHls\.noteSourceTimeline\(profile, sample\)/);
});
