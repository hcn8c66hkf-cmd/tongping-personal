import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildBrowserAppResourceMeta } from "../src/mcp-server.js";

const source = readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");

test("browser app tools point hosts at the shared UI resource", () => {
  assert.match(source, /"ui\/resourceUri": BROWSER_APP_URI/);
  assert.match(source, /"openai\/outputTemplate": BROWSER_APP_URI/);
  assert.match(source, /"openai\/widgetAccessible": true/);
});

test("ChatGPT compatibility metadata is returned at resource _meta top level", () => {
  const meta = buildBrowserAppResourceMeta(
    "https://browser.example.test",
    "wss://browser.example.test",
    "https://widget.example.test",
  ) as any;

  assert.deepEqual(meta.ui.csp, {
    resourceDomains: [
      "https://browser.example.test",
      "https://cdn.jsdelivr.net",
    ],
    connectDomains: [
      "https://browser.example.test",
      "wss://browser.example.test",
      "https://cdn.jsdelivr.net",
      "https://storage.googleapis.com",
    ],
  });
  assert.deepEqual(meta["openai/widgetCSP"], {
    resource_domains: [
      "https://browser.example.test",
      "https://cdn.jsdelivr.net",
    ],
    connect_domains: [
      "https://browser.example.test",
      "wss://browser.example.test",
      "https://cdn.jsdelivr.net",
      "https://storage.googleapis.com",
    ],
  });
  assert.equal(meta.ui["openai/widgetCSP"], undefined);
  assert.equal(meta["openai/widgetDomain"], "https://widget.example.test");
});

test("non-ChatGPT hosts receive only standard MCP Apps UI metadata", () => {
  const meta = buildBrowserAppResourceMeta(
    "https://browser.example.test",
    "wss://browser.example.test",
    undefined,
    false,
  ) as any;

  assert.ok(meta.ui.csp);
  assert.equal(meta.ui.domain, undefined);
  assert.equal(meta["openai/widgetCSP"], undefined);
  assert.equal(meta["openai/widgetDomain"], undefined);
});
