import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveDeploymentMode } from "../src/deployment-mode.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function waitForExit(
  child: ChildProcess,
  timeoutMs = 12_000,
): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("daemon did not exit"));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
}

test("M3-C deployment mode keeps absent/private compatibility and rejects explicit unknown modes", () => {
  assert.equal(resolveDeploymentMode({}), "private-single-user");
  assert.equal(
    resolveDeploymentMode({
      TONGPING_DEPLOYMENT_MODE: "private-single-user",
    }),
    "private-single-user",
  );
  assert.equal(
    resolveDeploymentMode({
      TONGPING_DEPLOYMENT_MODE: "hosted",
    }),
    "hosted",
  );
  assert.throws(
    () => resolveDeploymentMode({
      TONGPING_DEPLOYMENT_MODE: "mystery",
    }),
    /Invalid TONGPING_DEPLOYMENT_MODE/,
  );
  assert.throws(
    () => resolveDeploymentMode({
      TONGPING_DEPLOYMENT_MODE: "   ",
    }),
    /Invalid TONGPING_DEPLOYMENT_MODE/,
  );
});

test("M3-C hosted daemon with missing config fails before listen and creates no private state", { timeout: 15_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-m3c-missing-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/daemon.ts"],
    {
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
    },
  );

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await assert.rejects(fetch(origin + "/healthz"));
    const code = await waitForExit(child);
    assert.notEqual(code, 0);
    assert.deepEqual(await fs.readdir(home), []);
  } finally {
    await stop(child).catch(() => {});
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("M3-C unknown explicit mode fails before private runtime side effects", { timeout: 15_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-m3c-mode-"));
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/daemon.ts"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        TONGPING_HOME: home,
        TONGPING_HOST: "127.0.0.1",
        TONGPING_PORT: String(port),
        TONGPING_DEPLOYMENT_MODE: "definitely-not-a-mode",
      },
      stdio: "ignore",
    },
  );

  try {
    const code = await waitForExit(child);
    assert.notEqual(code, 0);
    assert.deepEqual(await fs.readdir(home), []);
  } finally {
    await stop(child).catch(() => {});
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("M3-C private-single-user actual daemon entry keeps existing private route behavior", { timeout: 30_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-m3c-private-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/daemon.ts"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        TONGPING_HOME: home,
        TONGPING_HOST: "127.0.0.1",
        TONGPING_PORT: String(port),
        TONGPING_DEPLOYMENT_MODE: "private-single-user",
        TONGPING_PAIRING_AUTHORITY: "private-single-user",
        TONGPING_OAUTH_PASSWORD: "",
      },
      stdio: "ignore",
    },
  );

  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`private daemon exited: ${child.exitCode}`);
      }
      try {
        const candidate = await fetch(origin + "/capture-helper");
        if (candidate.status === 200) {
          response = candidate;
          break;
        }
      } catch {
        // wait for the existing private daemon to finish startup
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(response, "private daemon did not expose existing capture helper");
    assert.equal(response.status, 200);
  } finally {
    await stop(child);
    await fs.rm(home, { recursive: true, force: true });
  }
});
