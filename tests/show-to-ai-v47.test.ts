import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(
  new URL("../src/browser-app.ts", import.meta.url),
  "utf8",
);

test("show-to-ai button is visible in the mode bar", () => {
  for (const token of [
    'id="showToAi"',
    'id="showToAiLabel">叫大家看',
    '把你现在看到的这一帧分享给群里的 AI 看',
    'shared-browser-v97',
  ]) {
    assert.ok(app.includes(token), token);
  }
});

test("companion mode captures the frame actually presented to the user", () => {
  for (const token of [
    'companionModeActive',
    'video.readyState >= 2',
    'ctx.drawImage(video',
    'source: "companion-presented-frame"',
    'crossorigin="anonymous"',
  ]) {
    assert.ok(app.includes(token), token);
  }
});

test("live mode captures the already presented canvas without a new screenshot", () => {
  for (const token of [
    'const live = $("liveCanvas")',
    'canvasImageBlock(live, 0.6)',
    'source: "live-presented-frame"',
  ]) {
    assert.ok(app.includes(token), token);
  }
});

test("server screenshot is a fallback only when the presented frame cannot be captured", () => {
  for (const token of [
    'let captured = captureCurrentDisplayedFrame()',
    'captured = await fetchCurrentFrameFallback()',
    'name: "browser_screenshot"',
    'fullPage: false',
  ]) {
    assert.ok(app.includes(token), token);
  }
});

test("explicit visual check parks the frame and sends a short system trigger", () => {
  for (const token of [
    '用户点了「叫大家看」；先调用 browser_look',
    'captured.image.data',
    '）看共享画面',
    '"【同屏 · 系统】" + userZhName() + " 按了「叫大家看」',
    'browser_app_chat_push 把回应推进群聊，再在自己的聊天里回应',
    'chatRelayInstruction()',
  ]) {
    assert.ok(app.includes(token), token);
  }
});

test("show-to-ai does not change live or companion mode", () => {
  const start = app.indexOf("async function showCurrentFrameToAi()");
  const end = app.indexOf("async function sendToAi()", start);
  assert.ok(start >= 0 && end > start);
  const body = app.slice(start, end);
  assert.ok(!body.includes("companionModeActive ="));
  assert.ok(!body.includes("stopCompanionPlayback"));
  assert.ok(!body.includes("closeLiveSocket"));
});
