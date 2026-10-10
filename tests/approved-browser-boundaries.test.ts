import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { BrowserService, type BrowserAction } from "../src/browser-service.js";

const html = `<!doctype html><title>boundary fixture</title>
<button id="pay" aria-label="继续" onclick="document.querySelector('#count').textContent=String(Number(document.querySelector('#count').textContent)+1)">确认支付</button>
<button id="ordinary">展开</button>
<form id="checkout" onsubmit="event.preventDefault();document.querySelector('#submitted').textContent='yes'">
  <input id="checkout-input" name="q"><button type="submit">确认支付</button>
</form>
<form id="search" onsubmit="event.preventDefault();document.querySelector('#searched').textContent='yes'">
  <input id="search-input" name="q"><button type="submit">搜索</button>
</form>
<input id="otp" autocomplete="one-time-code"><input id="card" autocomplete="cc-number">
<p id="count">0</p><p id="submitted">no</p><p id="searched">no</p>`;

test("model activation, navigation and wait boundaries in an isolated Chromium profile", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-approved-boundary-"));
  const server = createServer((_req, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const service = new BrowserService({ homeDir: root, profilesDir: path.join(root, "profiles"), headless: true });
  const call = (action: BrowserAction, args: Record<string, unknown> = {}) =>
    service.call({ action, args: { profile: "test", ...args }, client: "boundary-test" });
  const read = async (selector: string) => {
    const reply = await call("browser_read", { selector });
    assert.equal(reply.ok, true, reply.error);
    return (reply.result as { text: string }).text;
  };
  try {
    assert.equal((await call("browser_open", { url })).ok, true);
    const snap = await call("browser_snapshot");
    assert.equal(snap.ok, true, snap.error);
    const refs = (snap.result as { elements: Array<{ ref: string; tag: string; text: string }> }).elements;
    const buttons = refs.filter((item) => item.tag === "button");
    const inputs = refs.filter((item) => item.tag === "input");
    assert(buttons.length >= 2 && inputs.length >= 4);
    const pay = buttons[0]!.ref;
    const ordinary = buttons[1]!.ref;
    const checkoutInput = inputs[0]!.ref;
    const searchInput = inputs[1]!.ref;
    const otp = inputs[2]!.ref;
    const card = inputs[3]!.ref;

    for (const [action, args] of [
      ["browser_double_click", { ref: pay }],
      ["browser_press", { ref: pay, key: "Escape" }],
      ["browser_press", { ref: pay, key: "Enter" }],
      ["browser_press", { ref: checkoutInput, key: "Enter" }],
      ["browser_type", { ref: pay, text: "x", append: true }],
      ["browser_type", { ref: pay, text: "x" }],
    ] as const) {
      const reply = await call(action, args);
      assert.equal(reply.ok, false, `${action} should reject sensitive activation`);
    }
    assert.equal(await read("#count"), "0");
    assert.equal(await read("#submitted"), "no");
    assert.equal((await call("browser_double_click", { ref: ordinary })).ok, true);
    assert.equal((await call("browser_type", { ref: searchInput, text: "tongping" })).ok, true);
    assert.equal((await call("browser_press", { ref: searchInput, key: "Enter" })).ok, true);
    assert.equal(await read("#searched"), "yes");
    for (const ref of [otp, card]) {
      assert.equal((await call("browser_type", { ref, text: "123" })).ok, false);
    }

    for (const ms of [0, 1000, 10000]) {
      if (ms === 10000) continue; // exact upper bound is checked by the parser test.
      assert.equal((await call("browser_wait", { ms })).ok, true);
    }
    for (const ms of [10001, 1e12, -1, 0.5, "1000", Number.POSITIVE_INFINITY]) {
      assert.equal((await call("browser_wait", { ms })).ok, false, `wait ${ms} should reject`);
    }

    const browsers = (service as any).browsers;
    const originalScreenshot = browsers.screenshot;
    browsers.screenshot = async () => ({
      title: "private",
      url: "file:///synthetic-private.html",
      buffer: Buffer.from("SYNTHETIC_PRIVATE_MARKER"),
      viewport: null,
    });
    try {
      const changedDuringCapture = await call("browser_screenshot");
      assert.equal(changedDuringCapture.ok, false, "a privileged URL reached during capture must reject");
      assert.equal(JSON.stringify(changedDuringCapture).includes("SYNTHETIC_PRIVATE_MARKER"), false);
    } finally {
      browsers.screenshot = originalScreenshot;
    }

    const fixture = path.join(root, "synthetic-secret.txt");
    await writeFile(fixture, "SYNTHETIC_PRIVATE_MARKER", "utf8");
    const fileUrl = pathToFileURL(fixture).toString();
    assert.equal((await call("browser_open", { url: fileUrl })).ok, false);
    const page = await (service as any).browsers.page("test");
    await page.goto(fileUrl);
    const profiles = await call("browser_profiles", {});
    assert.equal(profiles.ok, true);
    const current = (profiles.result as Array<{ profile: string; url?: string; modelReadable?: boolean }>).find((row) => row.profile === "test");
    assert.equal(current?.modelReadable, false);
    assert.equal(JSON.stringify(current).includes("synthetic-secret"), false);
    for (const action of ["browser_read", "browser_snapshot", "browser_screenshot"] as const) {
      const reply = await call(action);
      assert.equal(reply.ok, false, `${action} must reject an already-open file page`);
      assert.equal(JSON.stringify(reply).includes("SYNTHETIC_PRIVATE_MARKER"), false);
    }
  } finally {
    await service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
