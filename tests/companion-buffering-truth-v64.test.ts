import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");

test("waiting or stalled does not immediately force buffering UI", () => {
  const waiting = app.indexOf('$("mediaVideo").addEventListener("waiting"');
  const stalled = app.indexOf('$("mediaVideo").addEventListener("stalled"');
  assert.ok(waiting >= 0);
  assert.ok(stalled >= 0);
  const waitingBlock = app.slice(waiting, stalled);
  assert.ok(waitingBlock.includes('scheduleCompanionBufferingCheck("waiting")'));
  assert.ok(!waitingBlock.includes('companionPhase = "buffering"'));
});

test("actual playback progress restores playing state and hides prep overlay", () => {
  const start = app.indexOf("function noteCompanionPlaybackProgress()");
  const end = app.indexOf("function scheduleCompanionBufferingCheck", start);
  const block = app.slice(start, end);
  assert.ok(block.includes('companionPhase = "playing"'));
  assert.ok(block.includes('$("companionPrep").classList.remove("on")'));
  assert.ok(block.includes("current > companionLastProgressTime + 0.03"));
});

test("buffering is declared only after progress fails a grace check", () => {
  const start = app.indexOf("function scheduleCompanionBufferingCheck");
  const end = app.indexOf('$("mediaVideo").addEventListener("playing"', start);
  const block = app.slice(start, end);
  assert.ok(block.includes("setTimeout(() =>"));
  assert.ok(block.includes("currentTime > startTime + 0.08"));
  assert.ok(block.includes("Date.now() - companionLastProgressAt < 900"));
  assert.ok(block.includes('companionPhase = "buffering"'));
  assert.ok(block.includes("}, 1100);"));
});
