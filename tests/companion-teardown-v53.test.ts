import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(
  new URL("../src/daemon.ts", import.meta.url),
  "utf8",
);
const hub = fs.readFileSync(
  new URL("../src/media-ws-hub.ts", import.meta.url),
  "utf8",
);
const app = fs.readFileSync(
  new URL("../src/browser-app.ts", import.meta.url),
  "utf8",
);

test("closing the current companion app has an explicit mode-aware teardown callback", () => {
  assert.ok(hub.includes("onAppModeClosed?:"));
  assert.ok(hub.includes("const mode = this.appModes.get(ws) ?? null;"));
  assert.ok(hub.includes("this.options.onAppModeClosed?.(profile, mode, code === COMPANION_LEAVE_CLOSE_CODE)"));
});

test("companion close uses a reconnect grace before worker capture teardown", () => {
  const start = daemon.indexOf("onAppModeClosed:");
  const end = daemon.indexOf("onWorkerStreamStart:", start);
  const body = daemon.slice(start, end);
  assert.ok(body.includes('mode !== "companion"'));
  assert.ok(body.includes("scheduleCompanionAppClose(profile)"));
  assert.ok(!body.includes('"human_media_stop"'));
  assert.ok(!body.includes("delayedCompanionHls.stop(profile)"));

  const graceStart = daemon.indexOf("function scheduleCompanionAppClose(");
  const graceEnd = daemon.indexOf("const watchCollectionStore", graceStart);
  const grace = daemon.slice(graceStart, graceEnd);
  assert.ok(grace.includes('"human_media_stop"'));
  assert.ok(grace.includes('"companion-app-close"'));
  assert.ok(grace.includes("delayedCompanionHls.stop(profile)"));
});

test("teardown ships under a fresh App resource identity", () => {
  assert.ok(app.includes("shared-browser-v94"));
});
