import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COMPANION_VIDEO_FILTER as COMPANION_VIDEO_FILTER_TEXT } from "../src/delayed-companion-hls.js";

const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");
const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");

test("worker v66 tries medium quality and automatically falls back on restart", () => {
  assert.ok(worker.includes('const WORKER_BUILD = "v95"'));
  assert.ok(worker.includes("companionQualityDegraded"));
  assert.ok(worker.includes("? 900_000"));
  assert.ok(worker.includes(": 2_000_000"));
  assert.ok(worker.includes("? 64_000"));
  assert.ok(worker.includes(": 96_000"));
  assert.ok(worker.includes("companionQualityDegraded.add(profile)")); // backpressure only
});

test("tab capture requests 20fps", () => {
  assert.ok(manager.includes("frameRate: { ideal: 20, max: 20 }"));
});

test("HLS quality tier is 1280 wide, 20fps, ~1600kbps with 2s GOP", () => {
  assert.ok(COMPANION_VIDEO_FILTER_TEXT.includes("scale=w=1280:h=-2:force_original_aspect_ratio=decrease"));
  assert.ok(hls.includes("pad=ceil(iw/2)*2:ceil(ih/2)*2"));
  assert.ok(hls.includes('"-r", "20"'));
  assert.ok(hls.includes('"-g", "40"'));
  assert.ok(hls.includes('"-keyint_min", "40"'));
  assert.ok(hls.includes('"-b:v", "1600k"'));
  assert.ok(hls.includes('"-maxrate", "2200k"'));
  assert.ok(hls.includes('"-bufsize", "3200k"'));
});
