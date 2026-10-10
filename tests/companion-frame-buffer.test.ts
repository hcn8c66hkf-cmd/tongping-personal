import test from "node:test";
import assert from "node:assert/strict";
import { CompanionFrameBuffer } from "../src/companion-frame-buffer.js";

const frame = (sequence: number, bytes = 10) => ({
  buffer: Buffer.alloc(bytes, sequence),
  viewport: { width: 100, height: 50 },
  sequence,
  capturedAt: sequence * 10,
});

test("companion buffer keeps the newest frame in each sampling bucket", () => {
  const buffer = new CompanionFrameBuffer({
    windowMs: 15_000,
    sampleIntervalMs: 500,
  });
  buffer.pushLegacy("default", frame(1), 1_000);
  buffer.pushLegacy("default", frame(2), 1_200);
  buffer.pushLegacy("default", frame(3), 1_499);
  buffer.pushLegacy("default", frame(4), 1_500);

  const status = buffer.statusLegacy("default", 1_500);
  assert.equal(status.frames, 2);
  assert.equal(buffer.selectLegacy("default", 0, 1_500)?.sequence, 4);
  assert.equal(buffer.selectLegacy("default", 0.001, 1_500)?.sequence, 3);
});

test("lookback selection never returns a frame newer than the target", () => {
  const buffer = new CompanionFrameBuffer({
    windowMs: 15_000,
    sampleIntervalMs: 500,
  });
  buffer.pushLegacy("default", frame(1), 10_000);
  buffer.pushLegacy("default", frame(2), 10_500);
  buffer.pushLegacy("default", frame(3), 11_000);

  const selected = buffer.selectLegacy("default", 0.75, 11_500);
  assert.equal(selected?.sequence, 2);
  assert.equal(selected?.storedAt, 10_500);
  assert.ok((selected?.offsetFromTargetMs ?? -1) >= 0);
});

test("lookback before the observed buffer returns no future frame", () => {
  const buffer = new CompanionFrameBuffer({
    windowMs: 15_000,
    sampleIntervalMs: 500,
  });
  buffer.pushLegacy("default", frame(1), 10_000);
  assert.equal(buffer.selectLegacy("default", 5, 11_000), null);
});

test("old frames are pruned by the rolling window", () => {
  const buffer = new CompanionFrameBuffer({
    windowMs: 2_000,
    sampleIntervalMs: 500,
  });
  buffer.pushLegacy("default", frame(1), 1_000);
  buffer.pushLegacy("default", frame(2), 2_000);
  buffer.pushLegacy("default", frame(3), 3_500);

  const status = buffer.statusLegacy("default", 3_500);
  assert.equal(status.frames, 2);
  assert.equal(buffer.selectLegacy("default", 0, 3_500)?.sequence, 3);
});

test("memory cap evicts oldest buffered frames", () => {
  const buffer = new CompanionFrameBuffer({
    windowMs: 15_000,
    sampleIntervalMs: 100,
    maxFrames: 20,
    maxBytesPerProfile: 1_000_000,
  });
  for (let i = 0; i < 12; i += 1) {
    buffer.pushLegacy("default", frame(i + 1, 120_000), i * 100);
  }

  const status = buffer.statusLegacy("default", 1_100);
  assert.ok(status.bytes <= 1_000_000);
  assert.ok(status.frames < 12);
  assert.equal(buffer.selectLegacy("default", 0, 1_100)?.sequence, 12);
});
