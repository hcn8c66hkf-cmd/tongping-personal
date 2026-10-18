import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");

test("companion records recent user interaction on the media element", () => {
  assert.ok(app.includes('for (const eventName of ["pointerdown", "touchstart", "click"])'));
  assert.ok(app.includes("companionLastUserMediaInteractionAt = Date.now()"));
});

test("unexpected Safari pause auto-resumes only when media is actually ready", () => {
  const start = app.indexOf('$("mediaVideo").addEventListener("pause"');
  const end = app.indexOf('$("mediaVideo").addEventListener("playing"', start);
  const block = app.slice(start, end);
  assert.ok(block.includes("video.readyState < 3"));
  assert.ok(block.includes("companionSeekPending"));
  assert.ok(block.includes("Date.now() - companionLastUserMediaInteractionAt < 1800"));
  assert.ok(block.includes("companionAutoResumeTimer = setTimeout"));
  assert.ok(block.includes("void video.play().then"));
});

test("manual pause intent is preserved instead of being auto-resumed", () => {
  const start = app.indexOf("const userPausedRecently =");
  const end = app.indexOf("if (video.readyState < 3)", start);
  const block = app.slice(start, end);
  assert.ok(block.includes('companionPhase = "ready"'));
  assert.ok(block.includes("return;"));
});

test("stop and fresh companion entry clear pending auto-resume state", () => {
  const resets = app.match(/companionAutoResumeTimer = null;/g) ?? [];
  assert.ok(resets.length >= 3);
  assert.ok(app.includes("companionLastUserMediaInteractionAt = 0"));
});

test("App v79 is the fresh resource identity", () => {
  assert.ok(app.includes("shared-browser-v96"));
});
