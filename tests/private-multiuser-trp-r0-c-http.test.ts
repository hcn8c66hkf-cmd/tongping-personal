import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PRIVATE_COMPAT_HUMAN_USER_ID } from "../src/private-persistent-owner.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function startDaemon(home: string, mode: "private-single-user" | "hosted"): Promise<{ origin: string; child: ChildProcess }> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TONGPING_HOME: home,
      TONGPING_TOKEN: "test-private-admin-token",
      TONGPING_HOST: "127.0.0.1",
      TONGPING_PORT: String(port),
      TONGPING_REMOTE_WORKER: "1",
      TONGPING_DEPLOYMENT_MODE: mode,
      TONGPING_PAIRING_AUTHORITY: "private-single-user",
      TONGPING_OAUTH_PASSWORD: "",
    },
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

async function stopDaemon(child: ChildProcess) {
  if (child.exitCode === null) {
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }
}

test("real HTTP trusted enrollment rejects caller owner fields, ignores labels, and issues no session", { timeout: 30_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-c-http-"));
  const { origin, child } = await startDaemon(home, "private-single-user");
  const post = (route: string, body: unknown, authorization?: string, headers: Record<string, string> = {}) => fetch(origin + route, {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}), ...headers },
    body: JSON.stringify(body),
  });
  try {
    assert.equal((await post("/v1/worker/enrollment-challenge", {})).status, 401);
    const issuedResponse = await post("/v1/worker/enrollment-challenge", {}, "Bearer test-private-admin-token");
    assert.equal(issuedResponse.status, 200);
    const issued = await issuedResponse.json() as { challenge: string };
    const id = randomUUID();
    assert.equal((await post("/v1/worker/enroll", { challenge: issued.challenge, device_id: id, human_user_id: "attacker" })).status, 400);
    assert.equal((await post("/v1/worker/enroll", { challenge: issued.challenge, device_id: id, owner: "attacker" })).status, 400);
    assert.equal((await post("/v1/worker/enroll", { challenge: issued.challenge, device_id: id, session_id: "attacker" })).status, 400);
    assert.equal((await post("/v1/worker/enroll", { challenge: issued.challenge, device_id: id, HostedProfileId: "attacker" })).status, 400);
    assert.equal((await post("/v1/worker/enroll", { challenge: issued.challenge, device_id: id, profile_alias: "attacker" })).status, 400);
    const enrolledResponse = await post("/v1/worker/enroll", {
      challenge: issued.challenge, device_id: id, name: "attacker-label", build: "attacker-build",
    }, undefined, { "x-forwarded-for": "192.0.2.99", "x-worker-hostname": "attacker-host" });
    assert.equal(enrolledResponse.status, 200);
    const enrolled = await enrolledResponse.json() as Record<string, unknown>;
    assert.equal(enrolled.human_user_id, PRIVATE_COMPAT_HUMAN_USER_ID);
    assert.equal(enrolled.device_id, id);
    assert.equal(enrolled.credential_version, 1);
    assert.equal(Object.hasOwn(enrolled, "session_id"), false);
    assert.equal(Object.hasOwn(enrolled, "token"), false);
    assert.equal((await post("/v1/worker/enroll", { challenge: issued.challenge, device_id: randomUUID() })).status, 401);
    const state = await fs.readFile(path.join(home, "worker-enrollment-state-v1.json"), "utf8");
    assert.equal(state.includes(String(enrolled.credential)), false);
    assert.equal(state.includes("attacker-label"), false);
    assert.equal(state.includes("attacker-build"), false);
  } finally {
    await stopDaemon(child);
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("real hosted daemon without hosted dependencies fails before exposing private enrollment", { timeout: 30_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-c-hosted-"));
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
    await assert.rejects(fetch(origin + "/v1/worker/enrollment-challenge"));
    await assert.rejects(fs.access(path.join(home, "worker-enrollment-state-v1.json")), { code: "ENOENT" });
  } finally {
    await stopDaemon(child);
    await fs.rm(home, { recursive: true, force: true });
  }
});
