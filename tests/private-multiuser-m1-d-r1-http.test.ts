import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

test("real MCP image link requires owner ticket and preserves browser save bytes", { timeout: 30_000 }, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r1-http-"));
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const origin = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url), stdio: "ignore",
    env: { ...process.env, TONGPING_HOME: home, TONGPING_TOKEN: "r1-admin",
      TONGPING_HOST: "127.0.0.1", TONGPING_PORT: String(address.port),
      TONGPING_PUBLIC_ORIGIN: origin, TONGPING_OAUTH_PASSWORD: "" },
  });
  const client = new Client({ name: "r1-http-test", version: "1.0.0" });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(origin + "/capture-helper")).status === 200; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true);
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: "Bearer r1-admin" } },
    }));
    const bytes = Buffer.from("image bytes exactly");
    const link = await client.callTool({ name: "browser_app_image_link", arguments: {
      identity: "attacker", profile: "other", imageBase64: bytes.toString("base64"),
      mimeType: "image/jpeg", name: "save me",
    } });
    const url = new URL((link.structuredContent as { url: string }).url);
    assert.equal(url.origin, origin);
    assert.ok(url.searchParams.get("ticket"));
    const valid = await fetch(url);
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get("content-type"), "image/jpeg");
    assert.equal(valid.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await valid.arrayBuffer()), bytes);
    const bare = new URL(url);
    bare.searchParams.delete("ticket");
    assert.equal((await fetch(bare)).status, 403);
    const forged = new URL(url);
    forged.searchParams.set("ticket", url.searchParams.get("ticket") + "x");
    assert.equal((await fetch(forged)).status, 403);
    const swapped = new URL(url);
    swapped.pathname = swapped.pathname.replace(/shared-image\/[^/]+/, "shared-image/AAAAAAAAAAAAAAAAAAAAAAAA");
    assert.equal((await fetch(swapped)).status, 403);
    const renamed = new URL(url);
    renamed.pathname = renamed.pathname.replace(/\/[^/]+$/, "/renamed.png");
    assert.deepEqual(Buffer.from(await (await fetch(renamed)).arrayBuffer()), bytes);
    const png = await client.callTool({ name: "browser_app_image_link", arguments: {
      identity: "someone-else", profile: "default", imageBase64: bytes.toString("base64"),
      mimeType: "image/png", name: "ticket",
    } });
    const pngResponse = await fetch((png.structuredContent as { url: string }).url);
    assert.equal(pngResponse.status, 200);
    assert.equal(pngResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await pngResponse.arrayBuffer()), bytes);
  } finally {
    await client.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", resolve));
    }
    await fs.rm(home, { recursive: true, force: true });
  }
});
