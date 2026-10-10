import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeLiveWsPacket,
  parseFramePacket,
} from "../src/live-ws-hub.js";

test("live websocket packet round-trips frame metadata", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const packet = encodeLiveWsPacket({
    buffer: jpeg,
    sequence: 42,
    width: 1024,
    height: 576,
    capturedAt: 1_800_000_000_123,
  });
  const frame = parseFramePacket(packet);
  assert.ok(frame);
  assert.equal(frame.sequence, 42);
  assert.equal(frame.width, 1024);
  assert.equal(frame.height, 576);
  assert.equal(frame.capturedAt, 1_800_000_000_123);
  assert.equal(frame.bytes, jpeg.length);
  assert.equal(frame.media, null);
  assert.equal(packet.length, 20 + jpeg.length);
  assert.deepEqual(frame.packet.subarray(20), jpeg);
});

test("live websocket packet rejects invalid dimensions", () => {
  const packet = Buffer.alloc(21);
  packet.writeUInt32BE(1, 0);
  packet.writeUInt32BE(0, 4);
  packet.writeUInt32BE(576, 8);
  packet.writeBigUInt64BE(BigInt(1_800_000_000_123), 12);
  packet[20] = 1;
  assert.equal(parseFramePacket(packet), null);
});
