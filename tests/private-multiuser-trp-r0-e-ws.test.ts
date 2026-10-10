import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { LiveWsHub, encodeLiveWsPacket } from "../src/live-ws-hub.js";
import { AudioWsHub, encodeAudioWsPacket } from "../src/audio-ws-hub.js";
import { MediaWsHub, encodeMediaSegmentPacket } from "../src/media-ws-hub.js";
import { workerSocketContext } from "../src/worker-transport-authority.js";
import type { WorkerConnectionHandle } from "../src/worker-connection-registry.js";

type Hub = LiveWsHub | AudioWsHub | MediaWsHub;
type Role = "live" | "control" | "audio" | "media";
const path: Record<Role, string> = {
  live: "/v1/worker/live-ws", control: "/v1/worker/control-ws",
  audio: "/v1/worker/audio-ws", media: "/v1/worker/media-ws",
};

function authority(session: string) {
  let current = true;
  let held: { entered: () => void; wait: Promise<void> } | null = null;
  const closures: Array<() => void | Promise<void>> = [];
  const context = Object.freeze({ humanUserId: "human-A", deviceId: "device-A", sessionId: session });
  const handle = {
    context,
    isCurrent: async () => {
      const gate = held;
      if (gate) { held = null; gate.entered(); await gate.wait; }
      return current;
    },
    registerRetirementResource: async (close: () => void | Promise<void>) => {
      if (current) closures.push(close); else await close();
    },
  } as unknown as WorkerConnectionHandle;
  return { handle, context, holdNextCheck: () => {
    let entered!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    held = { entered, wait };
    return { reached, release };
  }, revoke: async () => {
    current = false;
    await Promise.all(closures.map((close) => Promise.resolve().then(close)));
  } };
}

async function setup(role: Role, authorizeControlProducer?: (authority: WorkerConnectionHandle | true) => Promise<boolean>) {
  const first = authority("session-A");
  const second = authority("session-B");
  const writes: string[] = [];
  const authenticateWorker = async (request: http.IncomingMessage) => {
    const secret = request.headers.authorization?.replace(/^Worker /, "");
    if (secret === "session-A") return await first.handle.isCurrent() ? first.handle : null;
    if (secret === "session-B") return await second.handle.isCurrent() ? second.handle : null;
    return null;
  };
  const common = { authenticateWorker, authenticateApp: () => true, authorizeControlProducer };
  const hub: Hub = role === "live" || role === "control"
    ? new LiveWsHub({ ...common, onFrame: () => writes.push("frame") })
    : role === "audio"
      ? new AudioWsHub({ ...common, onChunk: () => writes.push("audio") })
      : new MediaWsHub({ ...common, onWorkerStreamStart: () => { writes.push("start"); }, onWorkerSegment: () => { writes.push("segment"); } });
  const server = http.createServer();
  server.on("upgrade", (request, socket, head) => {
    if (!hub.handleUpgrade(request, socket, head)) socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `ws://127.0.0.1:${address.port}${path[role]}?profile=local-profile&human_user_id=forged&device_id=forged&session_id=forged`;
  const connect = async (credential: string): Promise<WebSocket> => {
    const ws = new WebSocket(url, { headers: { Authorization: `Worker ${credential}`, "x-tongping-worker": "forged" } });
    await once(ws, "open");
    return ws;
  };
  const reject = async (credential: string) => {
    const ws = new WebSocket(url, { headers: { Authorization: `Worker ${credential}` } });
    ws.on("error", () => {});
    const [, response] = await once(ws, "unexpected-response");
    assert.ok(response.statusCode === 401 || response.statusCode === 403);
    response.resume();
  };
  const cleanup = async () => {
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  return { first, second, hub, writes, connect, reject, cleanup };
}

for (const role of ["live", "control", "audio", "media"] as const) {
  test(`TRP-WS-${role.toUpperCase()} exact session admission and retirement`, async () => {
    const s = await setup(role);
    try {
      await s.reject("legacy-global-token");
      const old = await s.connect("session-A");
      const map = (s.hub as unknown as { workers?: Map<string, WebSocket>; controlWorkers?: Map<string, WebSocket> });
      const serverSocket = role === "control" ? map.controlWorkers?.get("local-profile") : map.workers?.get("local-profile");
      assert.ok(serverSocket);
      assert.deepEqual(workerSocketContext(serverSocket), s.first.context);
      const oldClosed = once(old, "close");
      await s.first.revoke();
      await oldClosed;
      await s.reject("session-A");
      const current = await s.connect("session-B");
      const currentServerSocket = role === "control" ? map.controlWorkers?.get("local-profile") : map.workers?.get("local-profile");
      assert.ok(currentServerSocket);
      assert.deepEqual(workerSocketContext(currentServerSocket), s.second.context);
      current.close();
      await once(current, "close");
    } finally { await s.cleanup(); }
  });
}

test("TRP-WS-REPLACE-RACE queued old callbacks cannot write", async () => {
  for (const role of ["live", "control", "audio", "media"] as const) {
    const s = await setup(role);
    try {
      const old = await s.connect("session-A");
      const packet = role === "live" ? encodeLiveWsPacket({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), sequence: 1, width: 1, height: 1, capturedAt: Date.now() })
        : role === "audio" ? encodeAudioWsPacket({ buffer: Buffer.alloc(2), sequence: 1, sampleRate: 24_000, channels: 1, frames: 1, capturedAt: Date.now() })
          : encodeMediaSegmentPacket({ buffer: Buffer.from([1, 2, 3]), sequence: 1, capturedAt: Date.now() });
      const map = s.hub as unknown as { workers: Map<string, WebSocket>; controlWorkers: Map<string, WebSocket> };
      const oldServerSocket = role === "control" ? map.controlWorkers.get("local-profile") : map.workers.get("local-profile");
      assert.ok(oldServerSocket);
      const command = role === "control" ? (s.hub as LiveWsHub).workerCommand("local-profile", { type: "test" }) : null;
      const gate = s.first.holdNextCheck();
      if (role === "media") old.send(JSON.stringify({ type: "media_stream_start", streamId: "old", mimeType: "video/webm" }));
      else if (role === "control") old.send(JSON.stringify({ type: "worker_command_ack", id: "wcmd-1" }));
      else old.send(packet);
      await gate.reached;
      await s.first.revoke();
      gate.release();
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(s.writes, []);
      if (command) {
        assert.equal((s.hub as LiveWsHub).stats().workerCommands.acks, 0);
        assert.equal((await command).ok, false);
      }
      old.terminate();
    } finally { await s.cleanup(); }
  }
});

test("TRP-WS-STALE-CALLBACK late old socket cleanup preserves replacement profile owner", async () => {
  for (const role of ["live", "control", "audio", "media"] as const) {
    const s = await setup(role);
    try {
      const old = await s.connect("session-A");
      const map = s.hub as unknown as { workers: Map<string, WebSocket>; controlWorkers: Map<string, WebSocket> };
      const owners = role === "control" ? map.controlWorkers : map.workers;
      const oldServer = owners.get("local-profile");
      assert.ok(oldServer);
      const oldClosed = once(old, "close");
      const replacement = await s.connect("session-B");
      const newServer = owners.get("local-profile");
      assert.ok(newServer && newServer !== oldServer);
      await oldClosed;
      assert.equal(owners.get("local-profile"), newServer);
      assert.equal(newServer.readyState, WebSocket.OPEN);
      replacement.close();
      await once(replacement, "close");
    } finally { await s.cleanup(); }
  }
});

test("trusted control producer cannot send through a socket retired during target check", async () => {
  const s = await setup("control");
  try {
    const old = await s.connect("session-A");
    let delivered = 0;
    old.on("message", () => { delivered++; });
    const gate = s.first.holdNextCheck();
    const command = (s.hub as LiveWsHub).workerCommand("local-profile", { type: "live_restart" });
    let timeout!: NodeJS.Timeout;
    await Promise.race([
      gate.reached,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("control target check was skipped")), 500); }),
    ]);
    clearTimeout(timeout);
    assert.equal(delivered, 0, "control command was sent before authority check");
    await s.first.revoke();
    gate.release();
    assert.deepEqual(await command, { ok: false, error: "Realtime worker control websocket is not connected" });
    old.terminate();
  } finally { await s.cleanup(); }
});

test("trusted control producer fails closed when the private owner has ambiguous active devices", async () => {
  let unique = true;
  const s = await setup("control", async () => unique);
  try {
    const current = await s.connect("session-A");
    let delivered = 0;
    current.on("message", () => { delivered++; });
    unique = false;
    assert.equal((await (s.hub as LiveWsHub).workerCommand("local-profile", { type: "pointer" })).ok, false);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(delivered, 0);
    current.terminate();
  } finally { await s.cleanup(); }
});
