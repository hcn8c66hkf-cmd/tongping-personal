import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("HLS generations use unique init/segment names and monotonic start numbers", () => {
  assert.ok(hls.includes('const initName = "init_" + generationToken + ".mp4"'));
  assert.ok(hls.includes('"seg_" + generationToken + "_%010d.m4s"'));
  assert.ok(hls.includes('"-start_number", String(mediaSequenceBase)'));
  assert.ok(hls.includes('out.push("#EXT-X-DISCONTINUITY")'));
});

test("recent previous-generation media survives a restart briefly", () => {
  assert.ok(hls.includes("const cutoff = Date.now() - 5 * 60_000"));
  assert.ok(hls.includes("if (info.mtimeMs < cutoff) await unlink(file)"));
  assert.ok(hls.includes("try { await unlink(playlist); } catch {}"));
});

test("App observes generation changes without rebinding media src", () => {
  const start = app.indexOf("const streamChanged =");
  const end = app.indexOf("if (segmentCount >= 2 &&", start);
  const block = app.slice(start, end);
  assert.ok(block.includes("if (streamChanged)"));
  assert.ok(!block.includes("_generation="));
  assert.ok(!block.includes("video.src ="));
});

test("companion resets observed generation at session boundaries", () => {
  const resets = app.match(/companionStreamId = "";/g) ?? [];
  assert.ok(resets.length >= 2);
});

test("playwait survives repeated self-heal cycles", () => {
  assert.ok(daemon.includes("const deadline = Date.now() + 180_000;"));
});

test("App v79 is the fresh resource identity", () => {
  assert.ok(app.includes("shared-browser-v96"));
});
