import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const hub = fs.readFileSync(new URL("../src/media-ws-hub.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");
const mcp = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");

test("App reports the actual buffered HLS playback clock", () => {
  assert.ok(app.includes('type: "companion_playback_status"'));
  assert.ok(app.includes("video.currentTime"));
  assert.ok(app.includes("presentationDateMs"));
  assert.ok(app.includes("companionPlaybackStatusTimer = setInterval"));
  assert.ok(app.includes("shared-browser-v96"));
});

test("media hub stores profile-scoped companion playback status", () => {
  assert.ok(hub.includes("interface CompanionPlaybackStatus"));
  assert.ok(hub.includes('message.type === "companion_playback_status"'));
  assert.ok(hub.includes("companionPlaybackStatus(profile: string)"));
});

test("GPT visual frame is decoded from the same HLS buffer, never LIVE JPEG", () => {
  assert.ok(hls.includes("async frameAtPlayback("));
  assert.ok(hls.includes("extractJpegFrame("));
  assert.ok(daemon.includes("delayedCompanionHls.frameAtPlayback("));
  const optionsStart = daemon.indexOf("getCompanionFrame: async");
  const optionsEnd = daemon.indexOf("getCompanionFrameStatus:", optionsStart);
  assert.ok(optionsStart >= 0);
  assert.ok(!daemon.slice(optionsStart, optionsEnd).includes("companionFrameBuffer.select"));
});

test("companion perception does not renew or start LIVE", () => {
  assert.ok(!daemon.includes("renewCompanionLiveLease"));
  assert.ok(!mcp.includes("onCompanionActivity"));
});
