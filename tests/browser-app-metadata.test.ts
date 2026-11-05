import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");

test("browser app publishes standard and ChatGPT iOS compatibility metadata", () => {
  assert.match(source, /"ui\/resourceUri": BROWSER_APP_URI/);
  assert.match(source, /"openai\/outputTemplate": BROWSER_APP_URI/);
  assert.match(source, /"openai\/widgetAccessible": true/);
  assert.match(source, /"openai\/widgetCSP"/);
  assert.match(source, /resource_domains: appResourceDomains/);
  assert.match(source, /connect_domains: appConnectDomains/);
  assert.match(source, /"openai\/widgetPrefersBorder": false/);
});
