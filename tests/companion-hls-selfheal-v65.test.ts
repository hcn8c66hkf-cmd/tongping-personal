import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");

test("dead ffmpeg sessions cannot report a full companion buffer", () => {
  assert.ok(hls.includes("if (activeSession?.exited) return 0;"));
  assert.ok(hls.includes("if (activeSession?.exited) return null;"));
});

test("daemon restarts the whole companion recorder when ffmpeg exits unexpectedly", () => {
  assert.ok(daemon.includes("const companionHlsWatchdog = setInterval"));
  assert.ok(daemon.includes("companionHlsRecoveryReason(row, now, lastAttemptAt)"));
  assert.ok(daemon.includes("primeCompanionMediaProfile(profile, true)"));
  assert.ok(daemon.includes("companionHlsRecoveringProfiles"));
});

test("App v65 keeps probing HLS truth after playback starts", () => {
  assert.ok(app.includes("shared-browser-v93"));
  assert.ok(app.includes("scheduleCompanionProbe(companionVideoStarted ? 1500 : 900)"));
  assert.ok(app.includes("scheduleCompanionProbe(companionVideoStarted ? 1500 : 1200)"));
});
