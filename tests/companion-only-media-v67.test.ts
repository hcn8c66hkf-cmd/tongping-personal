import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("LIVE does not pre-open the WebM media lane", () => {
  const applyStart = app.indexOf('if (typeof next.mediaUrl === "string")');
  const applyEnd = app.indexOf('if (typeof next.inputUrl === "string")', applyStart);
  const apply = app.slice(applyStart, applyEnd);
  assert.ok(apply.includes("companionModeActive"));
  assert.ok(!apply.includes("canUseBufferedMediaLane()"));

  const ensureStart = app.indexOf("function ensureMediaSocket()");
  const ensureEnd = app.indexOf("socket.addEventListener", ensureStart);
  const ensure = app.slice(ensureStart, ensureEnd);
  assert.ok(ensure.includes("!companion"));
});

test("media_ready no longer starts a normal WebM capture", () => {
  const start = daemon.indexOf("onAppReady:");
  const end = daemon.indexOf("onCompanionReady:", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("Do not pre-start WebM"));
  assert.ok(!block.includes("primeMediaProfile("));
});

test("companion_ready remains the single buffered capture authority", () => {
  const start = daemon.indexOf("onCompanionReady:");
  const end = daemon.indexOf("onAppModeClosed:", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("primeCompanionMediaProfile(profile, true)"));
});

test("App v67 is the fresh resource identity", () => {
  assert.ok(app.includes("shared-browser-v100"));
});
