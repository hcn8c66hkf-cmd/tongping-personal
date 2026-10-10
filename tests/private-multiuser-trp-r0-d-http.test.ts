import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PRIVATE_COMPAT_HUMAN_USER_ID } from "../src/private-persistent-owner.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function start(home: string, mode: string) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, TONGPING_HOME: home, TONGPING_TOKEN: "r0-d-admin-token",
      TONGPING_HOST: "127.0.0.1", TONGPING_PORT: String(port),
      TONGPING_REMOTE_WORKER: "1", TONGPING_DEPLOYMENT_MODE: mode,
      TONGPING_PAIRING_AUTHORITY: "private-single-user", TONGPING_OAUTH_PASSWORD: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`daemon exited: ${child.exitCode}`);
    try { if ((await fetch(origin + "/capture-helper")).status === 200) return { origin, child }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error("daemon did not start");
}

async function stop(child: ChildProcess) {
  if (child.exitCode === null) {
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", resolve));
  }
}

test("real session endpoint rejects caller identity, replaces generation, and revoke blocks reuse", { timeout: 30_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-d-http-"));
  const { origin, child } = await start(home, "private-single-user");
  const post = (route: string, body: unknown, authorized = false) => fetch(origin + route, {
    method: "POST", headers: { "content-type": "application/json", ...(authorized ? { authorization: "Bearer r0-d-admin-token" } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const challengeResponse = await post("/v1/worker/enrollment-challenge", {}, true);
    assert.equal(challengeResponse.status, 200);
    const challenge = (await challengeResponse.json() as { challenge: string }).challenge;
    const deviceId = randomUUID();
    const enrolledResponse = await post("/v1/worker/enroll", { challenge, device_id: deviceId });
    assert.equal(enrolledResponse.status, 200);
    const enrolled = await enrolledResponse.json() as { credential: string };
    const input = { device_id: deviceId, device_credential: enrolled.credential };
    for (const field of ["human_user_id", "owner", "session_id", "profile", "HostedProfileId"]) {
      assert.equal((await post("/v1/worker/session", { ...input, [field]: "attacker" })).status, 400);
    }
    assert.equal((await post("/v1/worker/session", { ...input, device_credential: "X".repeat(43) })).status, 401);
    const firstResponse = await post("/v1/worker/session", { ...input, name: "attacker", build: "attacker" });
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as Record<string, unknown>;
    assert.equal(first.human_user_id, PRIVATE_COMPAT_HUMAN_USER_ID);
    assert.equal(first.device_id, deviceId);
    assert.notEqual(first.session_id, deviceId);
    assert.notEqual(first.session_credential, enrolled.credential);
    const secondResponse = await post("/v1/worker/session", input);
    assert.equal(secondResponse.status, 200);
    const second = await secondResponse.json() as Record<string, unknown>;
    assert.notEqual(second.session_id, first.session_id);
    assert.notEqual(second.session_credential, first.session_credential);
    assert.equal((await post("/v1/worker/revoke-device", { device_id: deviceId })).status, 401);
    const revokeResponse = await post("/v1/worker/revoke-device", { device_id: deviceId }, true);
    assert.equal(revokeResponse.status, 200);
    assert.equal((await post("/v1/worker/session", input)).status, 401);
    const state = await fs.readFile(path.join(home, "worker-enrollment-state-v1.json"), "utf8");
    assert.equal(state.includes(String(first.session_credential)), false);
    assert.equal(state.includes(String(second.session_credential)), false);
    assert.equal(state.includes("attacker"), false);
  } finally { await stop(child); await fs.rm(home, { recursive: true, force: true }); }
});

test("hosted mode without hosted dependencies fails before the private R0-D session seam exists", { timeout: 30_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-d-hosted-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TONGPING_HOME: home,
      TONGPING_HOST: "127.0.0.1",
      TONGPING_PORT: String(port),
      TONGPING_DEPLOYMENT_MODE: "hosted",
      TONGPING_DATABASE_URL: "",
      TONGPING_HOSTED_AUTH_ISSUER: "",
      TONGPING_HOSTED_AUTH_AUDIENCE: "",
      TONGPING_HOSTED_AUTH_JWKS_URL: "",
      TONGPING_HOSTED_AUTH_ALGORITHMS: "",
      TONGPING_HOSTED_AUTH_HUMAN_AUDIENCE_ONLY: "",
    },
    stdio: "ignore",
  });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("hosted daemon did not fail closed")), 12_000);
      child.once("exit", (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    assert.notEqual(code, 0);
    await assert.rejects(fetch(origin + "/v1/worker/session"));
  } finally { await stop(child); await fs.rm(home, { recursive: true, force: true }); }
});
