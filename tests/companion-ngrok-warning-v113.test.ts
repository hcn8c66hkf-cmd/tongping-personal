import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const daemon = readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("companion HLS requests bypass the free ngrok browser warning", () => {
  const occurrences = app.match(/ngrok-skip-browser-warning/g) ?? [];
  assert.ok(occurrences.length >= 2, "probe fetch and hls.js segment loader both set the bypass header");
  assert.match(app, /headers:\s*\{\s*"ngrok-skip-browser-warning":\s*"tongping"\s*\}/);
  assert.match(app, /xhr\.setRequestHeader\("ngrok-skip-browser-warning",\s*"tongping"\)/);
});

test("companion endpoints accept the ngrok bypass CORS preflight", () => {
  assert.match(daemon, /request\.method === "OPTIONS"/);
  assert.match(daemon, /"access-control-allow-methods": "GET, OPTIONS"/);
  assert.match(daemon, /"access-control-allow-headers": "ngrok-skip-browser-warning"/);
});
