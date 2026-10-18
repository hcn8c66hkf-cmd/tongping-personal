import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("companion UI uses actual HLS buffered seconds instead of wall-clock elapsed time", () => {
  assert.ok(app.includes("let companionBufferedSeconds = 0;"));
  assert.ok(app.includes("#TONGPING-BUFFERED-SECONDS:"));
  assert.ok(app.includes("Math.floor(companionBufferedSeconds)"));
  assert.ok(!app.slice(app.indexOf("function updateCompanionPreparingUi()"), app.indexOf("function clearCompanionProbe()")).includes("Date.now() - companionStartedAt"));
  assert.ok(/async bufferedSeconds\(\s*profile: string/.test(hls));
  assert.ok(daemon.includes("#TONGPING-BUFFERED-SECONDS:"));
});

test("worker media recorder uses timeslice as primary clock and requestData only as stale rescue", () => {
  assert.ok(worker.includes('const WORKER_BUILD = "v95";'));
  assert.ok(manager.includes("const rescueAfterMs = Math.max(3_000, chunkMs * 3);"));
  assert.ok(manager.includes("now - lastDataAt < rescueAfterMs"));
  assert.ok(manager.includes("now - lastRescueAt < rescueAfterMs"));
  assert.ok(manager.includes("recorder.start(chunkMs);"));
  assert.ok(!manager.includes("}, chunkMs);\n              }"));
});

test("app v60 remains compatible with cached v59 cards", () => {
  assert.ok(app.includes("shared-browser-v96"));
  const mcp = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
  assert.ok(mcp.includes("shared-browser-v59"));
});
