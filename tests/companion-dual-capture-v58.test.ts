import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(
  new URL("../src/daemon.ts", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../src/browser-manager.ts", import.meta.url),
  "utf8",
);
const workerClient = fs.readFileSync(
  new URL("../src/worker-client.ts", import.meta.url),
  "utf8",
);

test("companion readiness revokes realtime-audio capture authority", () => {
  const start = daemon.indexOf("onCompanionReady:");
  const end = daemon.indexOf("onAppModeClosed:", start);
  const body = daemon.slice(start, end);
  assert.ok(body.includes("stopAudioProfileForCompanion(profile)"));
  assert.ok(daemon.includes('"human_audio_stop", { profile }, "companion-audio-stop"'));
});

test("live stall watchdog does not restart screencast during companion capture", () => {
  const start = daemon.indexOf("const liveStallWatchdog");
  const end = daemon.indexOf("const audioWsHub", start);
  const body = daemon.slice(start, end);
  assert.ok(body.includes("companionMediaProfiles.has(profile)"));
  assert.ok(body.includes('mediaWsHub.appMode(profile) === "companion"'));
});

test("audio helper teardown is bounded like media teardown", () => {
  const start = worker.indexOf("async stopLiveAudio");
  const end = worker.indexOf("async startLiveMedia", start);
  const body = worker.slice(start, end);
  assert.ok(body.includes("Promise.race"));
  assert.ok(body.includes("setTimeout(resolve, 900)"));
  assert.ok(body.includes("setTimeout(resolve, 1200)"));
  assert.ok(body.includes("runBeforeUnload: false"));
});

test("worker live watchdog yields while companion media owns the profile", () => {
  const start = workerClient.indexOf("const liveWatchdog = setInterval");
  const end = workerClient.indexOf("liveWatchdog.unref", start);
  const body = workerClient.slice(start, end);
  assert.ok(body.includes("mediaStarted.has(profile)"));
  assert.ok(body.includes('mediaModes.get(profile) === "companion"'));
});
