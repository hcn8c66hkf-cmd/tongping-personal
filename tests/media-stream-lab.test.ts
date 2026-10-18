import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  encodeMediaSegmentPacket,
  parseMediaSegmentPacket,
} from "../src/media-ws-hub.js";

test("media segment packet preserves sequence, capture time and WebM bytes", () => {
  const payload = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
  const packet = encodeMediaSegmentPacket({
    buffer: payload,
    sequence: 17,
    capturedAt: 1_800_000_000_123,
  });
  const parsed = parseMediaSegmentPacket(packet);
  assert.ok(parsed);
  assert.equal(parsed.sequence, 17);
  assert.equal(parsed.capturedAt, 1_800_000_000_123);
  assert.deepEqual(parsed.payload, payload);
});

test("v50 worker exposes bounded WebM VP8 media transport", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /human_media_start/);
  assert.match(worker, /human_media_restart/);
  assert.match(worker, /human_media_stop/);
  assert.match(worker, /encodeMediaSegmentPacket/);
  assert.match(worker, /mediaModes\.get\(profile\) === "companion"/);
  assert.match(worker, /\? 4_000_000/);
  assert.match(worker, /: 256_000/);
  assert.doesNotMatch(worker, /scheduleMediaAttachRetry/);
  assert.match(
    worker,
    /failed tab-capture attach must not retry by opening another helper/,
  );
});

test("media capture only attaches to playable video and uses bounded WebM", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /startLiveMedia/);
  assert.match(manager, /querySelectorAll<HTMLVideoElement>\("video"\)/);
  assert.match(manager, /options\.videoBitsPerSecond \?\? 112_000/);
  assert.match(manager, /options\.chunkMs \?\? 250/);
  assert.match(manager, /recorder\.start\(chunkMs\)/);
  assert.match(manager, /video\/webm;codecs=vp8/);
  assert.match(manager, /frameRate: \{ ideal: 20, max: 20 \}/);
});

test("browser app switches media watching back to realtime for operations", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /id="mediaVideo"/);
  assert.match(app, /function ensureMediaSocket/);
  assert.match(app, /function enterRealtimeControlView/);
  assert.match(app, /closeMediaSocket\(true, true\)/);
  assert.match(app, /mediaModeActive && !state\.takeover/);
  assert.match(app, /Buffered media is never coordinate authority/);

  const activeViewport = app.slice(
    app.indexOf("function activeViewportElement"),
    app.indexOf("function logicalPoint"),
  );
  assert.doesNotMatch(activeViewport, /mediaVideo/);
});


test("media capture authority requires explicit app readiness and has no auto reconnect storm", () => {
  const hub = fs.readFileSync(
    new URL("../src/media-ws-hub.ts", import.meta.url),
    "utf8",
  );
  const daemon = fs.readFileSync(
    new URL("../src/daemon.ts", import.meta.url),
    "utf8",
  );
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );

  assert.match(hub, /message\.type !== "media_ready"/);
  assert.match(hub, /message\.type !== "companion_ready"/);
  assert.match(hub, /onAppReady\?\.\(profile\)/);
  assert.match(daemon, /onAppReady: \(_profile\) =>/);
  assert.match(daemon, /onCompanionReady: \(profile(?:, entry)?\) =>/);
  assert.match(daemon, /Do not pre-start WebM/);
  assert.match(daemon, /primeCompanionMediaProfile\(profile, true\)/);
  assert.match(app, /"companion_ready"[\s\S]{0,80}"media_ready"/);
  assert.match(app, /function isIosLikeHost/);
  assert.match(app, /if \(isIosLikeHost\(\)\) return false/);
  assert.match(
    app,
    /Media transport is one-shot per mounted app session/,
  );
  assert.doesNotMatch(
    app,
    /scheduleMediaReconnect\(\);[\s\S]{0,120}ensureMediaSocket\(\)/,
  );
});

test("daemon exposes a separately authenticated media websocket lane", () => {
  const daemon = fs.readFileSync(
    new URL("../src/daemon.ts", import.meta.url),
    "utf8",
  );
  const tickets = fs.readFileSync(
    new URL("../src/browser-app-ticket.ts", import.meta.url),
    "utf8",
  );
  assert.match(daemon, /new MediaWsHub/);
  assert.match(daemon, /mediaWs: mediaWsHub\.stats\(\)/);
  assert.match(daemon, /mediaWsHub\.handleUpgrade/);
  assert.match(tickets, /\/v1\/app\/media-ws/);
});


test("v50 media capture requires explicit app readiness instead of socket presence", () => {
  const hub = fs.readFileSync(
    new URL("../src/media-ws-hub.ts", import.meta.url),
    "utf8",
  );
  const daemon = fs.readFileSync(
    new URL("../src/daemon.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /message\.type !== "media_ready"/);
  assert.match(hub, /message\.type !== "companion_ready"/);
  assert.match(hub, /onAppReady\?\.\(profile\)/);
  assert.match(hub, /appReady\(profile: string\)/);
  assert.match(daemon, /onAppReady: \(_profile\) =>/);
  assert.match(daemon, /onCompanionReady: \(profile(?:, entry)?\) =>/);
  assert.match(daemon, /primeCompanionMediaProfile\(profile, true\)/);
  assert.match(daemon, /mediaWsHub\.appReady\(profile\)/);
});

test("v50 iOS-like hosts stay on realtime view and media failures never auto-reconnect", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /function isIosLikeHost/);
  assert.match(app, /iPhone\|iPad\|iPod/);
  assert.match(app, /function canUseBufferedMediaLane/);
  assert.match(app, /if \(isIosLikeHost\(\)\) return false/);
  assert.match(app, /message\.type === "media_stream_start"/);
  assert.match(app, /mediaSessionBlocked = true/);
  assert.match(app, /Automatic reconnect[\s\S]*capture-helper tab storms/);
  assert.doesNotMatch(
    app,
    /scheduleMediaReconnect\(\)[\s\S]{0,220}setTimeout\([^\n]*ensureMediaSocket/,
  );
  assert.match(app, /shared-browser-v99/);
});
