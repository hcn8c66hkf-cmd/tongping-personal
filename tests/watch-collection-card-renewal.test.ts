import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { renderBrowserApp } from "../src/browser-app.js";
import {
  createBrowserWatchCollectionUrl,
  createBrowserWatchCollectionWriteUrl,
  deriveBrowserAppSigningKey,
  verifyBrowserWatchCollectionTicket,
} from "../src/browser-app-ticket.js";

test("native card uses renewed READ and WRITE tickets without a live-ticket fallback", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-card-renewal-"));
  const key = deriveBrowserAppSigningKey("synthetic-card-ticket-key");
  let origin = "";
  let enabled = false;
  let allowedWriteSig = "";
  const writes: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderBrowserApp(origin));
      return;
    }
    if (request.url === "/assets/mcp-app-v2.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(`export class App {
        constructor() { window.__fakeApp = this; }
        async connect() { setTimeout(() => this.ontoolresult?.({structuredContent: window.__nextState}), 30); }
        getHostContext() { return {}; }
        async callServerTool() { return {structuredContent: window.__nextState}; }
      }
      export const applyDocumentTheme = () => {};
      export const applyHostStyleVariables = () => {};
      export const applyHostFonts = () => {};`);
      return;
    }
    const url = new URL(request.url ?? "/", origin);
    if (url.pathname !== "/v1/app/watch-collection") { response.writeHead(404); response.end(); return; }
    const operation = request.method === "POST" ? "write" : "read";
    const valid = verifyBrowserWatchCollectionTicket(key, url.searchParams.get("profile") ?? "", operation,
      url.searchParams.get("exp"), url.searchParams.get("sig"));
    if (!valid || (operation === "write" && url.searchParams.get("sig") !== allowedWriteSig)) {
      response.writeHead(403, { "content-type": "application/json" }); response.end(JSON.stringify({ ok: false })); return;
    }
    if (operation === "write") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { action: string; collectionId: string };
      writes.push(url.searchParams.get("sig")!);
      enabled = body.action === "enable";
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, collection: { enabled, collectionId: "synthetic-card-collection", tickets: [] } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  const state = (nowMs: number) => ({
    kind: "tongping", identity: "gpt", profile: "default", appUiBuild: "v93", liveUrl: "",
    watchCollectionUrl: createBrowserWatchCollectionUrl(origin, key, "default", 900, nowMs),
    watchCollectionWriteUrl: createBrowserWatchCollectionWriteUrl(origin, key, "default", 900, nowMs),
  });
  const first = state(Date.now());
  const renewed = state(Date.now() + 30_000);
  allowedWriteSig = new URL(first.watchCollectionWriteUrl).searchParams.get("sig")!;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    context = await chromium.launchPersistentContext(path.join(root, "profile"), { headless: true });
    const page = context.pages()[0] ?? await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((initial) => { (window as any).__nextState = initial; }, first);
    await page.goto(origin + "/");
    await page.waitForFunction(() => Boolean((window as any).__fakeApp));
    await page.waitForFunction(() => document.querySelector("#collectionSwitch")?.getAttribute("aria-pressed") === "false");
    await page.locator("#collectionSwitch").evaluate((element) => (element as HTMLElement).click());
    await page.locator("#collectionConsent").evaluate((element) => (element as HTMLElement).click());
    await page.waitForFunction(() => document.querySelector("#collectionSwitch")?.getAttribute("aria-pressed") === "true");
    assert.equal(writes[0], allowedWriteSig);

    allowedWriteSig = new URL(renewed.watchCollectionWriteUrl).searchParams.get("sig")!;
    await page.evaluate((next) => {
      (window as any).__nextState = next;
      (window as any).__fakeApp.ontoolresult({ structuredContent: next });
    }, renewed);
    await page.locator("#collectionSwitch").evaluate((element) => (element as HTMLElement).click());
    await page.waitForFunction(() => document.querySelector("#collectionSwitch")?.getAttribute("aria-pressed") === "false");
    assert.equal(writes.at(-1), allowedWriteSig);
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    await context?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
