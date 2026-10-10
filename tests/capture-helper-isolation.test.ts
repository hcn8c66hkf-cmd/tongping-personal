import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BrowserManager } from "../src/browser-manager.js";
import { assertModelNavigationUrl } from "../src/navigation-policy.js";

async function freePort() {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test("isolated companion capture reaches the real helper route without replacing the source tab", { timeout: 45_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-helper-isolation-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const daemon = spawn(process.execPath, ["--import", "tsx", "src/daemon.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, TONGPING_HOME: path.join(root, "daemon"), TONGPING_TOKEN: "synthetic-helper-token", TONGPING_HOST: "127.0.0.1", TONGPING_PORT: String(port), TONGPING_REMOTE_WORKER: "0" },
    stdio: "ignore",
  });
  const source = createHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><title>synthetic source</title><video controls width="320" height="180" src="/synthetic.mp4"></video><p id="marker">SOURCE_TAB</p>');
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  const sourceAddress = source.address();
  assert(sourceAddress && typeof sourceAddress !== "string");
  const originalCloudUrl = process.env.TONGPING_CLOUD_URL;
  process.env.TONGPING_CLOUD_URL = origin;
  const manager = new BrowserManager({ homeDir: root, profilesDir: path.join(root, "profiles"), headless: true });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (daemon.exitCode !== null) break;
      try { healthy = (await fetch(origin + "/capture-helper")).status === 200; } catch {}
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert.equal(healthy, true, "isolated helper route did not start");
    assert.doesNotThrow(() => assertModelNavigationUrl("https://browser.example.test/capture-helper"));
    const page = await manager.open("test", `http://127.0.0.1:${sourceAddress.port}/`);
    let helperResponse = false;
    page.context().on("response", (response) => {
      if (response.url() === origin + "/capture-helper" && response.status() === 200) helperResponse = true;
    });
    // Headless tab capture may stop after loading the helper. The route and tab
    // selection are the contract under test; a full media attach needs a GUI.
    await manager.startLiveMedia("test", () => {}).catch(() => undefined);
    assert.equal(helperResponse, true);
    assert.equal((await manager.page("test")).url(), page.url());
    assert.equal(await page.locator("#marker").innerText(), "SOURCE_TAB");
  } finally {
    await manager.closeAll();
    process.env.TONGPING_CLOUD_URL = originalCloudUrl;
    daemon.kill();
    if (daemon.exitCode === null) await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
    await new Promise<void>((resolve) => source.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
