import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("v50 adds media metadata as a text sidecar without changing binary frame encoding", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  const hub = fs.readFileSync(
    new URL("../src/live-ws-hub.ts", import.meta.url),
    "utf8",
  );

  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /type: "frame_media_meta"/);
  assert.match(worker, /encodeLiveWsPacket\(frame\)/);
  assert.match(hub, /parsed\.type === "frame_media_meta"/);
  assert.match(hub, /frame\.media = pending\?\.get\(metaKey\) \?\? null/);
});

test("media clock probe tracks player/media identity, epoch, playback state, and RVFC PTS", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );

  assert.match(manager, /sessionId/);
  assert.match(manager, /playerIdentity/);
  assert.match(manager, /mediaIdentity/);
  assert.match(manager, /epoch/);
  assert.match(manager, /"seek-start"/);
  assert.match(manager, /"active-player-change"/);
  assert.match(manager, /"media-identity-change"/);
  assert.match(manager, /"timeline-discontinuity"/);
  assert.match(manager, /requestVideoFrameCallback/);
  assert.match(manager, /"rvfc-media-time"/);
  assert.match(manager, /"waiting"/);
});

test("presented-frame status carries the exact sidecar associated with the ACKed frame", () => {
  const hub = fs.readFileSync(
    new URL("../src/live-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /media: expected\.media/);
  assert.match(hub, /latestFrameMedia/);
  assert.match(hub, /rememberSentFrame/);
});


test("v50 falls back to low-frequency active-media sampling when the page probe is stale", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /scheduleMediaClockFallback/);
  assert.match(manager, /now - lastAttempt < 250/);
  assert.match(manager, /sampleMediaClockFallback/);
  assert.match(manager, /ptsQuality: "playhead-estimate"/);
  assert.match(manager, /ptsSource: "html-media-currentTime"/);
  assert.match(manager, /fallback-timeline-discontinuity/);
  assert.match(manager, /performance\.timeOrigin/);
  assert.match(manager, /page\.frames\(\)\.map/);
});
