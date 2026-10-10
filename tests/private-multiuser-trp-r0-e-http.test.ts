import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { once } from "node:events";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { createBrowserControlUrl, deriveBrowserAppSigningKey } from "../src/browser-app-ticket.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function startTrusted() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-e-http-"));
  const barriers = path.join(home, "barriers");
  await fs.mkdir(barriers);
  // Seed a real legacy token to prove trusted mode rejects it even when present.
  await fs.mkdir(path.join(home, "worker-auth"));
  await fs.writeFile(path.join(home, "worker-auth", "worker-token"), "a".repeat(64) + "\n");
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, TONGPING_HOME: home, TONGPING_TOKEN: "r0-e-admin",
      TONGPING_HOST: "127.0.0.1", TONGPING_PORT: String(port),
      TONGPING_PUBLIC_ORIGIN: origin,
      TONGPING_REMOTE_WORKER: "1", TONGPING_DEPLOYMENT_MODE: "private-single-user",
      TONGPING_PAIRING_AUTHORITY: "private-single-user", TONGPING_TRUSTED_WORKER_TRANSPORT: "1",
      TONGPING_TEST_TRANSPORT_BARRIER_DIR: barriers,
      TONGPING_OAUTH_PASSWORD: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`daemon exited: ${child.exitCode}`);
    try { if ((await fetch(origin + "/capture-helper")).status === 200) return { home, barriers, origin, child }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error("daemon did not start");
}

async function arm(barriers: string, key: string) {
  await fs.writeFile(path.join(barriers, `${key}.arm`), "\n");
  const entered = path.join(barriers, `${key}.entered`);
  const wait = async () => {
    for (let i = 0; i < 500; i++) {
      try { await fs.access(entered); return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`HTTP barrier not reached: ${key}`);
  };
  const release = async () => { await fs.writeFile(path.join(barriers, `${key}.release`), "\n"); };
  return { wait, release };
}

function partialPost(origin: string, route: string, credential: string, body: Buffer) {
  const target = new URL(route, origin);
  const request = http.request(target, { method: "POST", headers: {
    authorization: `Worker ${credential}`, "content-type": "application/octet-stream", "content-length": body.length,
  } });
  const result = new Promise<{ status: number; text: string }>((resolve, reject) => {
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      response.on("aborted", () => reject(new Error("response aborted")));
      response.on("error", reject);
    });
    request.on("error", reject);
  });
  request.write(body.subarray(0, 1));
  return { finish: () => request.end(body.subarray(1)), result };
}

async function stop(child: ChildProcess, home: string) {
  if (child.exitCode === null) {
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", resolve));
  }
  await fs.rm(home, { recursive: true, force: true });
}

async function enroll(origin: string) {
  const post = (route: string, body: unknown, admin = false) => fetch(origin + route, {
    method: "POST", headers: { "content-type": "application/json", ...(admin ? { authorization: "Bearer r0-e-admin" } : {}) },
    body: JSON.stringify(body),
  });
  const challenge = await (await post("/v1/worker/enrollment-challenge", {}, true)).json() as { challenge: string };
  const deviceId = randomUUID();
  const bound = await (await post("/v1/worker/enroll", { challenge: challenge.challenge, device_id: deviceId })).json() as { credential: string };
  const input = { device_id: deviceId, device_credential: bound.credential };
  const open = async () => {
    const response = await post("/v1/worker/session", input);
    assert.equal(response.status, 200);
    return response.json() as Promise<{ session_credential: string; session_id: string }>;
  };
  return { deviceId, input, open, post };
}

test("trusted HTTP ingress accepts only exact current session credential", { timeout: 30_000 }, async () => {
  const { home, origin, child } = await startTrusted();
  try {
    const { open } = await enroll(origin);
    const first = await open();
    const legacy = (await fs.readFile(path.join(home, "worker-auth", "worker-token"), "utf8")).trim();
    const routes = [
      ["GET", "/v1/worker/room?wait=0", undefined],
      ["POST", "/v1/worker/poll", undefined],
      ["POST", "/v1/worker/result", JSON.stringify({ id: "unknown", reply: { ok: true } })],
      ["POST", "/v1/worker/frame?profile=default", Buffer.from([1])],
      ["POST", "/v1/worker/live-frame?profile=default", Buffer.from([1])],
      ["POST", "/v1/worker/live-stream?profile=default", Buffer.alloc(0)],
    ] as const;
    for (const [method, route, body] of routes) {
      const response = await fetch(origin + route, { method, headers: { authorization: `Worker ${legacy}` }, body });
      assert.equal(response.status, 401, `${method} ${route} accepted legacy token`);
    }
    assert.equal((await fetch(origin + "/v1/worker/room?wait=0", { headers: { authorization: `Worker ${first.session_credential}` } })).status, 200);
    const second = await open();
    assert.notEqual(second.session_id, first.session_id);
    assert.equal((await fetch(origin + "/v1/worker/room?wait=0", { headers: { authorization: `Worker ${first.session_credential}` } })).status, 401);
    assert.equal((await fetch(origin + "/v1/worker/room?wait=0", { headers: { authorization: `Worker ${second.session_credential}` } })).status, 200);
  } finally { await stop(child, home); }
});

test("trusted HTTP body and long-poll races reject original stale generation", { timeout: 30_000 }, async () => {
  const { home, barriers, origin, child } = await startTrusted();
  try {
    const { open } = await enroll(origin);
    let current = await open();
    const health = async () => (await (await fetch(origin + "/health")).json()) as {
      frameUpload: { accepted: number }; liveFrame: { accepted: number };
    };

    for (const [key, route, body, counter] of [
      ["frame-body", "/v1/worker/frame?profile=stale-frame", Buffer.from([1, 2, 3]), "frameUpload"],
      ["live-frame-body", "/v1/worker/live-frame?profile=stale-live", Buffer.from([0xff, 0xd8, 1]), "liveFrame"],
      ["result-body", "/v1/worker/result", Buffer.from(JSON.stringify({ id: "unknown", reply: { ok: true } })), null],
    ] as const) {
      const before = counter ? (await health())[counter].accepted : null;
      const gate = await arm(barriers, key);
      const upload = partialPost(origin, route, current.session_credential, body);
      await gate.wait(); // Real server read the first body chunk under the old credential.
      current = await open();
      upload.finish();
      await gate.release();
      assert.equal((await upload.result).status, 401, route);
      if (counter) assert.equal((await health())[counter].accepted, before, `${route} wrote stale state`);
    }

    for (const [key, route, method] of [
      ["room-admitted", "/v1/worker/room?wait=0", "GET"],
      ["poll-admitted", "/v1/worker/poll", "POST"],
    ] as const) {
      const gate = await arm(barriers, key);
      const pending = fetch(origin + route, { method, headers: { authorization: `Worker ${current.session_credential}` } });
      await gate.wait(); // Admission occurred before replacement.
      current = await open();
      await gate.release();
      assert.equal((await pending).status, 401, route);
    }
  } finally { await stop(child, home); }
});

test("trusted live stream stops old chunks after replacement", { timeout: 30_000 }, async () => {
  const { home, barriers, origin, child } = await startTrusted();
  try {
    const { open } = await enroll(origin);
    const first = await open();
    const gate = await arm(barriers, "live-stream-first-frame");
    const frame = (sequence: number) => {
      const packet = Buffer.alloc(28);
      packet.writeUInt32BE(4, 0);
      packet.writeUInt32BE(sequence, 4);
      packet.writeUInt32BE(1, 8);
      packet.writeUInt32BE(1, 12);
      packet.writeBigUInt64BE(BigInt(Date.now()), 16);
      packet.set([0xff, 0xd8, 0xff, 0xd9], 24);
      return packet;
    };
    const request = http.request(new URL("/v1/worker/live-stream?profile=stream-race", origin), {
      method: "POST", headers: { authorization: `Worker ${first.session_credential}` },
    });
    const result = new Promise<void>((resolve, reject) => {
      request.on("response", (response) => {
        response.on("data", () => {});
        response.on("end", resolve);
        response.on("aborted", reject);
        response.on("error", reject);
      });
      request.on("error", reject);
    });
    // Replacement is expected to abort the old stream. Attach the rejection
    // handler immediately so a fast abort cannot become a process-level
    // unhandledRejection before the assertion sequence reaches it.
    const settledResult = result.catch(() => {});
    request.write(frame(1));
    await gate.wait(); // The first packet was written; callback is held before the next chunk.
    const before = await (await fetch(origin + "/health")).json() as { liveFrame: { accepted: number } };
    assert.equal(before.liveFrame.accepted, 1);
    const second = await open();
    request.write(frame(2));
    request.end();
    await gate.release();
    await settledResult; // Existing 200 streaming headers may already have been sent.
    const after = await (await fetch(origin + "/health")).json() as { liveFrame: { accepted: number } };
    assert.equal(after.liveFrame.accepted, 1, "old stream wrote after replacement");
    const fresh = await fetch(origin + "/v1/worker/live-frame?profile=stream-race", {
      method: "POST", headers: { authorization: `Worker ${second.session_credential}` }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    assert.equal(fresh.status, 200);
    const final = await (await fetch(origin + "/health")).json() as { liveFrame: { accepted: number } };
    assert.equal(final.liveFrame.accepted, 2);
  } finally { await stop(child, home); }
});

test("daemon admits all four Worker WS roles by session and retires old sockets", { timeout: 30_000 }, async () => {
  const { home, origin, child } = await startTrusted();
  try {
    const { open } = await enroll(origin);
    const legacy = (await fs.readFile(path.join(home, "worker-auth", "worker-token"), "utf8")).trim();
    const roles = [
      ["live-ws", "liveWs", "workerProfiles"],
      ["control-ws", "liveWs", "controlWorkerProfiles"],
      ["audio-ws", "audioWs", "workerProfiles"],
      ["media-ws", "mediaWs", "workerProfiles"],
    ] as const;
    for (const [role, hub, count] of roles) {
      const url = origin.replace(/^http/, "ws") + `/v1/worker/${role}?profile=default&human_user_id=forged&device_id=forged&session_id=forged`;
      const connect = async (credential: string) => {
        const ws = new WebSocket(url, { headers: { authorization: `Worker ${credential}`, "x-tongping-worker": "forged" } });
        await once(ws, "open");
        return ws;
      };
      const reject = async (credential: string) => {
        const ws = new WebSocket(url, { headers: { authorization: `Worker ${credential}` } });
        ws.on("error", () => {});
        const [, response] = await once(ws, "unexpected-response");
        assert.ok(response.statusCode === 401 || response.statusCode === 403);
        response.resume();
      };
      await reject(legacy);
      const first = await open();
      const old = await connect(first.session_credential);
      for (let i = 0; i < 100; i++) {
        const state = await (await fetch(origin + "/health")).json() as Record<string, Record<string, number>>;
        if (state[hub]?.[count] === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const closed = once(old, "close");
      const second = await open();
      await closed;
      await reject(first.session_credential);
      const current = await connect(second.session_credential);
      current.close();
      await once(current, "close");
    }
  } finally { await stop(child, home); }
});

test("real private producer queues only on current relay; old result cannot complete replacement work", { timeout: 30_000 }, async () => {
  const { home, origin, child } = await startTrusted();
  try {
    const { open } = await enroll(origin);
    const controlUrl = createBrowserControlUrl(origin, deriveBrowserAppSigningKey("r0-e-admin"), "default", "tongping", 45);
    const startControl = () => fetch(controlUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ takeover: true }) });
    const poll = async (credential: string) => {
      const response = await fetch(origin + "/v1/worker/poll", { method: "POST", headers: { authorization: `Worker ${credential}` } });
      assert.equal(response.status, 200);
      return response.json() as Promise<{ id: string; action: string }>;
    };
    const result = (credential: string, id: string) => fetch(origin + "/v1/worker/result", {
      method: "POST", headers: { authorization: `Worker ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ id, reply: { ok: true } }),
    });
    const first = await open();
    const firstControl = startControl();
    const firstCommand = await poll(first.session_credential);
    assert.equal(firstCommand.action, "human_takeover_start");
    assert.equal((await result(first.session_credential, firstCommand.id)).status, 200);
    const firstControlResponse = await firstControl;
    assert.equal(firstControlResponse.status, 200, await firstControlResponse.text());

    const second = await open();
    const secondControl = startControl();
    const secondCommand = await poll(second.session_credential);
    assert.notEqual(secondCommand.id, firstCommand.id);
    assert.equal((await result(first.session_credential, secondCommand.id)).status, 401);
    assert.equal((await result(second.session_credential, secondCommand.id)).status, 200);
    const secondControlResponse = await secondControl;
    assert.equal(secondControlResponse.status, 200, await secondControlResponse.text());
  } finally { await stop(child, home); }
});
