import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("audio hub exposes profile-specific worker chunk liveness", () => {
  const hub = fs.readFileSync(
    new URL("../src/audio-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /workerLastChunkAt = new Map/);
  assert.match(hub, /workerLastChunkAgeMs\(profile: string/);
  assert.match(hub, /this\.workerLastChunkAt\.set\(profile, Date\.now\(\)\)/);
  assert.match(hub, /this\.workerLastChunkAt\.delete\(profile\)/);
});

test("daemon only reprimes stalled audio when media is actively playing", () => {
  const daemon = fs.readFileSync(
    new URL("../src/daemon.ts", import.meta.url),
    "utf8",
  );
  assert.match(daemon, /const audioStallWatchdog = setInterval/);
  assert.match(daemon, /lastChunkAge >= 3_000/);
  assert.match(daemon, /primedFor >= 4_000/);
  assert.match(daemon, /now - previousAttempt < 6_000/);
  assert.match(daemon, /"browser_media_context"/);
  assert.match(daemon, /media\.paused !== false/);
  assert.match(daemon, /Number\(media\.readyState \?\? 0\) < 2/);
  assert.match(daemon, /"audio-stall-recovery"/);
});
