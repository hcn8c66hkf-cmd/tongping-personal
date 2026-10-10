import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const mcp = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");

test("HLS probe counts segment URI lines across newlines", () => {
  assert.ok(app.includes(".split(/\\\\r?\\\\n/)"));
  assert.ok(app.includes(".filter((line) => /\\\\.m4s(?:\\\\?|$)/.test(line))"));
  assert.ok(!app.includes("text.match(/\\\\.m4s(?:\\\\?|$)/g"));
});

test("app v60 keeps cached v59 cards compatible", () => {
  assert.ok(app.includes("shared-browser-v93"));
  assert.ok(mcp.includes("shared-browser-v59"));
});
