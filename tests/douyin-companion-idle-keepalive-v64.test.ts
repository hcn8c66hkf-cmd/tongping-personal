import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("companion idle keepalive is explicitly Douyin-only", () => {
  const start = manager.indexOf("if (keepSourcePlaying)");
  const end = manager.indexOf("let hasVideo = false", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes('location.hostname === "douyin.com"'));
  assert.ok(block.includes('location.hostname.endsWith(".douyin.com")'));
  assert.ok(block.includes("if (!isDouyin) return;"));
  assert.ok(block.includes("video.ended"));
  assert.ok(block.includes("video.paused"));
  assert.ok(block.includes("video.play()"));
  assert.ok(block.includes("3_000"));
});

test("leaving companion capture clears the Douyin keepalive interval", () => {
  const start = manager.indexOf("async stopLiveMedia(");
  const end = manager.indexOf("async listProfiles(", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("__tongpingCompanionKeepalive"));
  assert.ok(block.includes("clearInterval"));
  assert.ok(block.includes("delete root.__tongpingCompanionKeepalive"));
});

test("only companion capture asks for source keepalive and worker build is v79", () => {
  assert.ok(worker.includes("keepSourcePlaying: true"));
  assert.match(worker, /const WORKER_BUILD = "v95"/);
});
