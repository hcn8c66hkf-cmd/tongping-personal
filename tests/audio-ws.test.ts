import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeAudioWsPacket,
  parseAudioWsPacket,
} from "../src/audio-ws-hub.js";

test("audio websocket packet round-trips PCM metadata", () => {
  const pcm = Buffer.alloc(480 * 2);
  for (let i = 0; i < 480; i += 1) {
    pcm.writeInt16LE((i * 97) % 32767, i * 2);
  }

  const packet = encodeAudioWsPacket({
    buffer: pcm,
    sequence: 42,
    sampleRate: 24000,
    channels: 1,
    frames: 480,
    capturedAt: 1789955000123,
  });
  const decoded = parseAudioWsPacket(packet);

  assert.ok(decoded);
  assert.equal(decoded.sequence, 42);
  assert.equal(decoded.sampleRate, 24000);
  assert.equal(decoded.channels, 1);
  assert.equal(decoded.frames, 480);
  assert.equal(decoded.capturedAt, 1789955000123);
  assert.deepEqual(decoded.packet.subarray(24), pcm);
});

test("audio websocket packet rejects malformed PCM length", () => {
  const packet = encodeAudioWsPacket({
    buffer: Buffer.alloc(10),
    sequence: 1,
    sampleRate: 24000,
    channels: 1,
    frames: 20,
    capturedAt: Date.now(),
  });
  assert.equal(parseAudioWsPacket(packet), null);
});
