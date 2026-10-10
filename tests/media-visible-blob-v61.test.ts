import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("tab media capture accepts visible blob/MSE video without finite duration", () => {
  const start = manager.indexOf("async startLiveMedia(");
  const end = manager.indexOf("await this.stopLiveMedia(normalized);", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes('source.startsWith("blob:")'));
  assert.ok(block.includes("video.readyState >= 1"));
  assert.ok(block.includes("rect.width > 0"));
  assert.ok(!block.includes("Number.isFinite(video.duration)"));
});

test("video readiness retry allows SPA metadata to settle without long stall", () => {
  const start = manager.indexOf("async startLiveMedia(");
  const end = manager.indexOf("await this.stopLiveMedia(normalized);", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("attempt < 6"));
  assert.ok(block.includes("setTimeout(resolve, 500)"));
});

test("worker build is v61 for visible blob video eligibility", () => {
  assert.match(worker, /const WORKER_BUILD = "v95"/);
});
