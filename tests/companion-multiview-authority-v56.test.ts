import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(
  new URL("../src/daemon.ts", import.meta.url),
  "utf8",
);
const mcp = fs.readFileSync(
  new URL("../src/mcp-server.ts", import.meta.url),
  "utf8",
);
const app = fs.readFileSync(
  new URL("../src/browser-app.ts", import.meta.url),
  "utf8",
);

test("companion authority suppresses LIVE watchdog restarts from stale viewers", () => {
  const start = daemon.indexOf("const liveStallWatchdog");
  const end = daemon.indexOf("audioStallWatchdog", start);
  const body = daemon.slice(start, end);
  assert.ok(body.includes("companionMediaProfiles.has(profile)"));
  assert.ok(body.includes('mediaWsHub.appMode(profile) === "companion"'));
  assert.ok(body.indexOf("companionMediaProfiles.has(profile)") < body.indexOf('workerCommand(profile, { type: "live_restart" }'));
});

test("expected media websocket gap during restart cannot recursively start a second capture", () => {
  assert.ok(daemon.includes("mediaRestartInFlightProfiles.add(profile)"));
  assert.ok(daemon.includes("mediaRestartInFlightProfiles.delete(profile)"));
  assert.ok(daemon.includes("mediaRestartInFlightProfiles.has(profile)"));
});

test("v60 is current and cached v59 cards resolve to current renderer", () => {
  assert.ok(app.includes("shared-browser-v101"));
  assert.ok(mcp.includes('"ui://tongping/shared-browser-v58"'));
});
