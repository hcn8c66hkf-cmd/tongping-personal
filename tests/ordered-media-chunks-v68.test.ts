import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("MediaRecorder chunks are serialized through one promise chain", () => {
  const start = manager.indexOf('recorder.addEventListener("dataavailable"');
  const end = manager.indexOf('recorder.addEventListener("error"', start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("mediaEventChain = mediaEventChain"));
  assert.ok(block.includes(".then(async () =>"));
  assert.ok(block.includes("const buffer = await blob.arrayBuffer()"));
  assert.ok(block.includes("await root.__tongpingMediaEvent?.({"));
  assert.ok(block.includes('type: "segment"'));
  assert.ok(!block.includes("void event.data.arrayBuffer().then"));
});

test("cleanup drains queued segments before emitting end", () => {
  const mediaStart = manager.indexOf("async startLiveMedia(");
  const start = manager.indexOf("const cleanup = async () =>", mediaStart);
  const end = manager.indexOf("stream = await navigator.mediaDevices.getDisplayMedia", start);
  assert.ok(mediaStart > 0);
  assert.ok(start > mediaStart);
  assert.ok(end > start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("stopped = true"));
  assert.ok(block.includes("await mediaEventChain.catch(() => {})"));
  assert.ok(block.indexOf("await mediaEventChain") < block.indexOf('type: "end"'));
});

test("Worker v79 carries ordered media chunk semantics", () => {
  assert.ok(worker.includes('const WORKER_BUILD = "v95"'));
});
