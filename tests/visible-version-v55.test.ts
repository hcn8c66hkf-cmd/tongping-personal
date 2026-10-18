import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import { BROWSER_APP_URI, renderBrowserApp } from "../src/browser-app.js";

const app = fs.readFileSync(
  new URL("../src/browser-app.ts", import.meta.url),
  "utf8",
);
const mcp = fs.readFileSync(
  new URL("../src/mcp-server.ts", import.meta.url),
  "utf8",
);
const daemon = fs.readFileSync(
  new URL("../src/daemon.ts", import.meta.url),
  "utf8",
);

test("menu visibly shows app and worker builds and follows MCP state updates", { timeout: 15_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://browser.example.test/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/") {
        await route.fulfill({ contentType: "text/html", body: renderBrowserApp("http://browser.example.test") });
      } else if (pathname === "/assets/mcp-app-v2.js") {
        await route.fulfill({ contentType: "text/javascript", body: `
          export class App {
            constructor() { window.__fakeApp = this; }
            async connect() {}
            getHostContext() { return {}; }
            async callServerTool() { return {}; }
          }
          export const applyDocumentTheme = () => {};
          export const applyHostStyleVariables = () => {};
          export const applyHostFonts = () => {};
        ` });
      } else {
        await route.fulfill({ status: 404, body: "" });
      }
    });
    await page.goto("http://browser.example.test/");
    await page.locator("#menuToggle").click();
    const fallback = `App ${BROWSER_APP_URI.split("-").at(-1)} · Worker —`;
    await page.waitForFunction((expected) => document.getElementById("appVersion")?.textContent === expected, fallback);
    assert.equal(await page.locator("#appVersion").isVisible(), true);

    for (const [appUiBuild, workerBuild, expected] of [
      ["v100", "v200", "App v100 · Worker v200"],
      ["v101", "v201", "App v101 · Worker v201"],
      ["", "", fallback],
    ]) {
      await page.evaluate(({ appUiBuild, workerBuild }) => {
        (window as any).__fakeApp.ontoolresult({ structuredContent: { kind: "tongping", appUiBuild, workerBuild } });
      }, { appUiBuild, workerBuild });
      await page.waitForFunction((expected) => document.getElementById("appVersion")?.textContent === expected, expected);
      assert.equal(await page.locator("#appVersion").isVisible(), true);
      assert.equal(await page.locator("#title").textContent(), expected);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("MCP state carries current UI and worker builds", () => {
  assert.ok(mcp.includes('appUiBuild: BROWSER_APP_URI.split("-").at(-1) ?? ""'));
  assert.ok(mcp.includes('workerBuild: options.getWorkerBuild?.() ?? ""'));
  assert.ok(daemon.includes('getWorkerBuild: () => lastWorkerBuild'));
});

test("v54 cached cards are compatible after the v60 resource bump", () => {
  assert.ok(mcp.includes('"ui://tongping/shared-browser-v54"'));
  assert.ok(app.includes('shared-browser-v94'));
});
