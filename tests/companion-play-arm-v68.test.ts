import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("playback truth comes from actual video state instead of the armed flag", () => {
  const start = app.indexOf("if (segmentCount >= 2 &&");
  const end = app.indexOf("} catch {}", start);
  const block = app.slice(start, end);
  assert.ok(block.includes("if ((video.paused || stalledPlayback) && !video.ended)"));
  assert.ok(block.includes("await video.play()"));
  assert.ok(block.includes("companionVideoStarted = !video.paused && !video.ended"));
  assert.ok(block.includes("companionPlaybackArmed = companionVideoStarted || companionPlaybackArmed"));
});

test("playlist probe keeps the original media src and retries automatically", () => {
  const start = app.indexOf("if (segmentCount >= 2 &&");
  const end = app.indexOf("} catch {}", start);
  const block = app.slice(start, end);
  assert.ok(block.includes("await video.play()"));
  assert.ok(block.includes("scheduleCompanionProbe(900)"));
  assert.ok(!block.includes("video.src ="));
});

test("playwait survives repeated companion self-heals", () => {
  assert.ok(daemon.includes("const deadline = Date.now() + 180_000;"));
});

test("App v89 is the fresh resource identity", () => {
  assert.ok(app.includes("shared-browser-v96"));
});
