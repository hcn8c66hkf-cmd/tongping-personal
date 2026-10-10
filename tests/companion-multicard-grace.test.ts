import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("companion app close uses grace instead of immediate HLS teardown", () => {
  const start = daemon.indexOf("onAppModeClosed:");
  const end = daemon.indexOf("onWorkerStreamStart:", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("scheduleCompanionAppClose(profile)"));
  assert.ok(!block.includes("delayedCompanionHls.stop(profile)"));
  assert.ok(!block.includes('"human_media_stop"'));
});

test("reconnected companion cancels pending close grace", () => {
  const start = daemon.indexOf("onCompanionReady:");
  const end = daemon.indexOf("onAppModeClosed:", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("cancelCompanionAppClose(profile)"));
});

test("grace teardown preserves capture when companion authority has returned", () => {
  const start = daemon.indexOf("function scheduleCompanionAppClose(");
  const end = daemon.indexOf("const watchCollectionStore", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("10_000"));
  assert.ok(block.includes("mediaWsHub.appSubscribers(profile) > 0"));
  assert.ok(block.includes("mediaWsHub.appReady(profile)"));
  assert.ok(block.includes('mediaWsHub.appMode(profile) === "companion"'));
});

test("companion audio stop is profile-deduplicated across card reconnects", () => {
  assert.ok(daemon.includes("const companionAudioStoppedProfiles = new Set<string>();"));
  const start = daemon.indexOf("function stopAudioProfileForCompanion(");
  const end = daemon.indexOf("function primeMediaProfile(", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("companionAudioStoppedProfiles.has(profile)"));
  assert.ok(block.includes("companionAudioStoppedProfiles.add(profile)"));
});
