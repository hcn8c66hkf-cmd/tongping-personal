import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { WebSocket } from "ws";
import { encodeLiveWsPacket } from "../src/live-ws-hub.js";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function start() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-m1-d-daemon-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, TONGPING_HOME: home, TONGPING_TOKEN: "m1-d-admin",
      TONGPING_HOST: "127.0.0.1", TONGPING_PORT: String(port),
      TONGPING_PUBLIC_ORIGIN: origin, TONGPING_REMOTE_WORKER: "1",
      TONGPING_DEPLOYMENT_MODE: "private-single-user",
      TONGPING_PAIRING_AUTHORITY: "private-single-user", TONGPING_TRUSTED_WORKER_TRANSPORT: "1",
      TONGPING_OAUTH_PASSWORD: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`daemon exited ${child.exitCode}`);
    try { if ((await fetch(origin + "/capture-helper")).status === 200) return { home, origin, child }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error("daemon did not start");
}

async function stop(child: ChildProcess, home: string) {
  if (child.exitCode === null) {
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", resolve));
  }
  await fs.rm(home, { recursive: true, force: true });
}

test("daemon trusted live WS writes only its resolved route; MCP read loses old frame on session replacement", { timeout: 30_000 }, async () => {
  const { home, origin, child } = await start();
  const client = new Client({ name: "m1-d-r0-test", version: "1.0.0" });
  try {
    const post = (route: string, body: unknown, admin = false) => fetch(origin + route, {
      method: "POST", headers: { "content-type": "application/json", ...(admin ? { authorization: "Bearer m1-d-admin" } : {}) },
      body: JSON.stringify(body),
    });
    const challenge = await (await post("/v1/worker/enrollment-challenge", {}, true)).json() as { challenge: string };
    const deviceId = randomUUID();
    const bound = await (await post("/v1/worker/enroll", { challenge: challenge.challenge, device_id: deviceId })).json() as { credential: string };
    const open = async () => {
      const response = await post("/v1/worker/session", { device_id: deviceId, device_credential: bound.credential });
      assert.equal(response.status, 200);
      return response.json() as Promise<{ session_credential: string }>;
    };
    const connect = async (credential: string) => {
      const ws = new WebSocket(origin.replace(/^http/, "ws") + "/v1/worker/live-ws?profile=default&profile_id=forged&human_user_id=forged", {
        headers: { authorization: `Worker ${credential}` },
      });
      await once(ws, "open");
      return ws;
    };
    const health = async () => (await (await fetch(origin + "/health")).json()) as {
      companionBuffer: { routes: number; frames: number; bytes: number };
    };
    const sendFrame = async (ws: WebSocket, sequence: number) => {
      ws.send(encodeLiveWsPacket({ buffer: Buffer.from([0xff, 0xd8, sequence, 0xff, 0xd9]), sequence, width: 1, height: 1, capturedAt: Date.now() }));
      for (let i = 0; i < 100; i++) {
        if ((await health()).companionBuffer.frames > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("trusted frame did not reach buffer");
    };
    const first = await open();
    const old = await connect(first.session_credential);
    await sendFrame(old, 1);
    const persisted = await fs.readFile(path.join(home, "worker-profile-bindings-v1.json"), "utf8");
    assert.equal(persisted.includes("forged"), false);
    assert.equal((await health()).companionBuffer.frames, 1);
    const transport = new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: "Bearer m1-d-admin" } },
    });
    await client.connect(transport);
    const read = async () => {
      const result = await client.callTool({ name: "browser_companion_frame", arguments: { profile: "default", lookbackSeconds: 0 } });
      const text = result.content.find((item) => item.type === "text");
      return text && "text" in text ? JSON.parse(text.text) as { available: boolean; sequence?: number; source?: string } : null;
    };
    assert.equal((await read())?.available, true);
    assert.equal((await read())?.sequence, 1);
    assert.equal((await read())?.source, "companion-buffer");
    const closed = once(old, "close");
    const replacement = await open();
    await closed;
    assert.equal((await read())?.available, false);
    assert.equal((await health()).companionBuffer.frames, 0);
    const current = await connect(replacement.session_credential);
    await sendFrame(current, 2);
    assert.equal((await read())?.sequence, 2);
    current.close();
    await once(current, "close");
  } finally { await client.close().catch(() => {}); await stop(child, home); }
});
