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

test("worker reconnect restores the app's actual companion authority", () => {
  assert.ok(daemon.includes('mediaWsHub.appMode(profile) === "companion"'));
  assert.ok(daemon.includes("primeCompanionMediaProfile(profile)"));
  assert.ok(hub.includes('appMode(profile: string): "media" | "companion" | null'));
});

test("ordinary media readiness cannot downgrade an active companion session", () => {
  const start = daemon.indexOf("function primeMediaProfile");
  const end = daemon.indexOf("function primeCompanionMediaProfile", start);
  const body = daemon.slice(start, end);
  assert.ok(body.includes("companionMediaProfiles.has(profile)"));
  assert.ok(body.includes('mediaWsHub.appMode(profile) === "companion"'));
});

test("media websocket dispatches callbacks when an already-ready app changes mode", () => {
  assert.ok(hub.includes("previousMode !== mode"));
  assert.ok(hub.includes("!wasReady || previousMode !== mode"));
});

test("companion entry shuts down realtime audio before starting delayed capture", () => {
  const start = app.indexOf("async function toggleCompanionMode()");
  const end = app.indexOf("async function startPreparedCompanionPlayback", start);
  const body = app.slice(start, end);
  assert.ok(body.includes("closeAudioSocket(true)"));
  assert.ok(body.indexOf("closeAudioSocket(true)") < body.indexOf("companionModeActive = true"));
  assert.ok(app.includes("shared-browser-v100"));
});
