import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("look and ticket hand-offs live at module level, shared by per-request MCP servers", () => {
  const server = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
  const factory = server.indexOf("export function createTongpingMcpServer(");
  for (const name of ["const sharedWatchTickets = new Map", "const sharedLooks = new Map"]) {
    const at = server.indexOf(name);
    assert.ok(at >= 0 && at < factory, name + " must be declared before the factory");
  }
});
