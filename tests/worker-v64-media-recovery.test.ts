import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("media context falls back to basic HTML media when subtitle instrumentation fails", () => {
  assert.ok(manager.includes("Subtitle/DOM instrumentation is best-effort"));
  assert.ok(manager.includes("const fallback = await frame.evaluate"));
  assert.ok(manager.includes('document.querySelectorAll<HTMLMediaElement>("video, audio")'));
  assert.ok(manager.includes("if (fallback) candidates.push(fallback)"));
});

test("companion capture nudges the best active video into view before eligibility check", () => {
  const start = manager.indexOf("async startLiveMedia(");
  const end = manager.indexOf("let hasVideo = false;", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("chosen.scrollIntoView"));
  assert.ok(block.includes('src.startsWith("blob:")'));
  assert.ok(block.includes("await new Promise<void>((resolve) => setTimeout(resolve, 120))"));
});

test("worker build is v79 for robust media recovery", () => {
  assert.ok(worker.includes('const WORKER_BUILD = "v95"'));
});
