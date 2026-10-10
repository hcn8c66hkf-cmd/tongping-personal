import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MediaWsHub, encodeMediaSegmentPacket } from "../src/media-ws-hub.js";

test("first WebM chunk waits until async stream initialization completes", async () => {
  let finishStart!: () => void;
  const started = new Promise<void>((resolve) => { finishStart = resolve; });
  let sawStart!: () => void;
  const startCalled = new Promise<void>((resolve) => { sawStart = resolve; });
  const events: string[] = [];
  const hub = new MediaWsHub({
    authenticateWorker: () => true,
    authenticateApp: () => true,
    onWorkerStreamStart: async () => {
      events.push("start");
      sawStart();
      await started;
      events.push("ready");
    },
    onWorkerSegment: (_profile, _id, segment) => {
      events.push("chunk:" + segment.sequence);
    },
  });
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    close: () => void;
  };
  socket.readyState = 1;
  socket.close = () => {};
  (hub as unknown as { acceptWorker: (profile: string, ws: typeof socket) => void })
    .acceptWorker("test", socket);
  socket.emit("message", Buffer.from(JSON.stringify({
    type: "media_stream_start", streamId: "generation-1", mimeType: "video/webm",
  })), false);
  await startCalled;
  socket.emit("message", encodeMediaSegmentPacket({
    buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    sequence: 1,
    capturedAt: Date.now(),
  }), true);
  assert.deepEqual(events, ["start"]);
  finishStart();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["start", "ready", "chunk:1"]);
  hub.close();
});
