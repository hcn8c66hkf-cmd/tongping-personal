import test from "node:test";
import assert from "node:assert/strict";
import OpusScript from "opusscript";
import {
  encodeAudioWsPacket,
  parseAudioWsPacket,
  encodeOpusWorkerAudioPacket,
  parseOpusWorkerAudioPacket,
} from "../src/audio-ws-hub.js";

test("worker opus packet is much smaller than equivalent PCM and round-trips", () => {
  const sampleRate = 24_000;
  const channels = 1;
  const frames = 480; // 20 ms
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const value = Math.round(
      Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 12_000,
    );
    pcm.writeInt16LE(value, i * 2);
  }

  const codec = new OpusScript(
    sampleRate,
    channels,
    OpusScript.Application.AUDIO,
  );
  codec.setBitrate(32_000);
  const encoded = codec.encode(pcm, frames);
  const workerPacket = encodeOpusWorkerAudioPacket({
    buffer: encoded,
    sequence: 7,
    sampleRate,
    channels,
    frames,
    capturedAt: 1_800_000_000_000,
  });
  const parsed = parseOpusWorkerAudioPacket(workerPacket);
  assert.ok(parsed);
  assert.equal(parsed.sampleRate, sampleRate);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.frames, frames);
  assert.ok(parsed.bytes < pcm.length / 2);

  const decoded = codec.decode(parsed.buffer);
  assert.equal(decoded.length, pcm.length);

  const appPacket = encodeAudioWsPacket({
    buffer: decoded,
    sequence: parsed.sequence,
    sampleRate: parsed.sampleRate,
    channels: parsed.channels,
    frames: parsed.frames,
    capturedAt: parsed.capturedAt,
  });
  const appChunk = parseAudioWsPacket(appPacket);
  assert.ok(appChunk);
  assert.equal(appChunk.bytes, pcm.length);
  codec.delete();
});

test("v50 worker encodes playback audio before the cloud websocket", async () => {
  const fs = await import("node:fs");
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /AUDIO_OPUS_BITRATE = 32_000/);
  assert.match(worker, /AUDIO_OPUS_FRAME_MS = 20/);
  assert.match(worker, /encodeOpusWorkerAudioPacket/);
  assert.ok(worker.includes("encoder.setBitrate(AUDIO_OPUS_BITRATE)"));
  assert.ok(!worker.includes("encodeAudioWsPacket(chunk)"));
});
