import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("read-only tools never launch an inactive profile; they fall back to the watched one", () => {
  const server = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
  assert.match(server, /export function createTongpingMcpServer\(\n  rawGateway: BrowserGateway,/);
  for (const action of ["browser_media_context", "browser_audio_vision", "browser_snapshot", "browser_read", "browser_screenshot"]) {
    assert.match(server, new RegExp('"' + action + '",'));
  }
  assert.match(server, /profileRedirect = \{/);
  assert.match(server, /has no open browser window\. Open a page there with browser_open first/);
});
