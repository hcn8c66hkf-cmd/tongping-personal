import test from "node:test";
import assert from "node:assert/strict";
import { AudioVisionAnalyzer } from "../src/audio-vision.js";

function sineChunk(
  frequency: number,
  sampleRate = 24_000,
  frames = 2_048,
  capturedAt = Date.now(),
  mediaTime = 1,
) {
  const buffer = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.65;
    const pcm = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buffer.writeInt16LE(pcm, i * 2);
  }
  return {
    buffer,
    sampleRate,
    channels: 1,
    frames,
    sequence: 1,
    capturedAt,
    mediaTime,
  };
}

test("Audio Vision estimates pitch and energy from a sine wave", () => {
  const analyzer = new AudioVisionAnalyzer("default");
  analyzer.ingest(sineChunk(440));
  const readout = analyzer.read(5);

  assert.equal(readout.ready, true);
  assert.ok(readout.latest);
  assert.ok((readout.latest.pitchHz ?? 0) > 420);
  assert.ok((readout.latest.pitchHz ?? 0) < 460);
  assert.ok(readout.latest.pitchConfidence > 0.4);
  assert.ok(readout.latest.energy > 0.5);
  assert.equal(readout.latest.mediaTime, 1);
});

test("Audio Vision distinguishes bass-heavy and bright signals", () => {
  const bass = new AudioVisionAnalyzer("bass");
  bass.ingest(sineChunk(100));
  const bassPoint = bass.read(5).latest;
  assert.ok(bassPoint);
  assert.ok(bassPoint.bass > 0.6);

  const bright = new AudioVisionAnalyzer("bright");
  bright.ingest(sineChunk(4_000));
  const brightPoint = bright.read(5).latest;
  assert.ok(brightPoint);
  assert.ok(brightPoint.treble > 0.6);
  assert.ok(brightPoint.brightness > (bassPoint?.brightness ?? 0));
});

test("Audio Vision keeps a bounded recent timeline", () => {
  const analyzer = new AudioVisionAnalyzer("timeline");
  const base = 1_700_000_000_000;
  for (let i = 0; i < 15; i += 1) {
    analyzer.ingest(
      sineChunk(220 + i * 3, 24_000, 2_048, base + i * 250, i * 0.25),
    );
  }
  const readout = analyzer.read(2);
  assert.ok(readout.timeline.length >= 7);
  assert.ok(readout.timeline.length <= 10);
  assert.ok(readout.sectionRibbon.length >= 1);
});

test("browser audio capture installs page compiler helper shim", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /globalThis\.__name/);
  assert.match(source, /page\.addInitScript/);
});
