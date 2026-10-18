import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const mcp = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");

test("a playing companion session wakes the host once per watch entry", () => {
  assert.match(app, /async function startAiCompanionWatch\(\)/);
  assert.match(app, /void startAiCompanionWatch\(\)/);
  assert.match(app, /companionAiWatchRequested = false/);
  assert.match(app, /不要只看一帧就退出/);
});

test("companion tick waits, returns a safe frame, and explicitly continues", () => {
  assert.match(mcp, /"browser_companion_tick"/);
  assert.match(mcp, /waitMs: z\.number\(\)\.int\(\)\.min\(0\)\.max\(15_000\)/);
  assert.match(mcp, /source: "companion-tick"/);
  assert.match(mcp, /continueWatching/);
  assert.match(mcp, /call browser_companion_tick again while continueWatching is true/i);
});
