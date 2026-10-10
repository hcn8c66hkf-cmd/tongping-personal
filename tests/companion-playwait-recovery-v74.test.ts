import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const originalUrl = "https://example.test/v1/app/companion-hls?_playwait=1";

test("a media error retains the one-tap playback URL for the next probe", () => {
  const marker = '$("mediaVideo").addEventListener("error", () => {';
  const from = source.indexOf(marker);
  const to = source.indexOf(String.fromCharCode(10) + '});', from) + 4;
  assert.ok(from >= 0 && to > from);
  let handler: (() => void) | undefined;
  const video = {
    src: originalUrl,
    paused: true,
    removeAttribute(name: string) { if (name === "src") this.src = ""; },
    pause() {},
    load() {},
  };
  const ctx = {
    $: (id: string) => ({ mediaVideo: video } as Record<string, unknown>)[id],
    companionModeActive: true,
    companionUserPaused: false,
    companionVideoStarted: true,
    companionPlaybackArmed: true,
    companionPhase: "playing",
    clearCompanionBufferingCheck() {},
    updateCompanionPreparingUi() {},
    render() {},
    scheduleCompanionProbe(_delay: number) {},
  };
  vm.runInNewContext(source.slice(from, to).replace(marker, 'register("error", () => {'), {
    ...ctx,
    register: (_name: string, callback: () => void) => { handler = callback; },
  });
  assert.ok(handler);
  handler();
  assert.equal(video.src, originalUrl);
});

test("a ready playlist reloads a failed media element on its existing URL", async () => {
  const from = source.indexOf("async function probeCompanionPlaylist() {");
  const to = source.indexOf("function companionPresentationDateMs", from);
  assert.ok(from >= 0 && to > from);
  let loads = 0;
  let plays = 0;
  const video = {
    src: originalUrl,
    error: { code: 4 } as { code: number } | null,
    paused: true,
    ended: false,
    style: { display: "none" },
    load() { loads++; this.error = null; },
    async play() {
      plays++;
      if (this.error) throw new Error("media element still failed");
      this.paused = false;
    },
  };
  const ctx: Record<string, unknown> = {
    companionModeActive: true,
    companionUserPaused: false,
    state: { takeover: false },
    companionVideoStarted: false,
    companionPlaybackArmed: false,
    companionLastRecoveryLoadAt: 0,
    companionLastProgressAt: 0,
    companionLastUserMediaInteractionAt: 0,
    companionSeekPending: false,
    companionStreamId: "",
    companionBufferedSeconds: 20,
    companionDelaySeconds: 20,
    $: (id: string) => ({ mediaVideo: video } as Record<string, unknown>)[id],
    updateCompanionPreparingUi() {},
    companionPlaylistUrl: () => "https://example.test/playlist",
    fetch: async () => ({
      ok: true,
      text: async () => "#EXTM3U\n#EXTINF:2,\none.m4s\n#EXTINF:2,\ntwo.m4s\n",
    }),
    parseCompanionTimelineMetadata() {},
    renderCompanionTimeline() {},
    scheduleCompanionProbe() {},
    render() {},
    setNudgeStatus() {},
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(from, to).split(String.fromCharCode(92, 92)).join(String.fromCharCode(92)), ctx);
  await (ctx.probeCompanionPlaylist as () => Promise<void>)();
  assert.equal(video.src, originalUrl);
  assert.equal(loads, 1);
  assert.equal(plays, 1);
  assert.equal(video.paused, false);
});

test("a stalled live window reloads and resumes without replacing its URL", async () => {
  const from = source.indexOf("async function probeCompanionPlaylist() {");
  const to = source.indexOf("function companionPresentationDateMs", from);
  let loads = 0;
  let plays = 0;
  const video = {
    src: originalUrl, error: null, paused: true, ended: false, readyState: 2,
    style: { display: "none" },
    load() { loads++; this.readyState = 3; },
    async play() { plays++; this.paused = false; },
  };
  const ctx: Record<string, unknown> = {
    companionModeActive: true,
    companionUserPaused: false, state: { takeover: false },
    companionVideoStarted: true, companionPlaybackArmed: true,
    companionStreamId: "same-stream", companionBufferedSeconds: 20,
    companionDelaySeconds: 20, companionLastProgressAt: Date.now() - 7_000,
    companionLastRecoveryLoadAt: 0, companionLastUserMediaInteractionAt: 0,
    companionSeekPending: false,
    $: (id: string) => ({ mediaVideo: video } as Record<string, unknown>)[id],
    updateCompanionPreparingUi() {},
    companionPlaylistUrl: () => "https://example.test/playlist",
    fetch: async () => ({
      ok: true,
      text: async () => "#EXTM3U\n#TONGPING-STREAM-ID:same-stream\n#EXTINF:2,\none.m4s\n#EXTINF:2,\ntwo.m4s\n",
    }),
    parseCompanionTimelineMetadata() {}, renderCompanionTimeline() {},
    scheduleCompanionProbe() {}, render() {}, setNudgeStatus() {}, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(from, to).split(String.fromCharCode(92, 92)).join(String.fromCharCode(92)), ctx);
  await (ctx.probeCompanionPlaylist as () => Promise<void>)();
  assert.equal(video.src, originalUrl);
  assert.equal(loads, 1);
  assert.equal(plays, 1);
  video.paused = true;
  video.readyState = 2;
  await (ctx.probeCompanionPlaylist as () => Promise<void>)();
  assert.equal(loads, 1);
  assert.equal(plays, 2);
});


test("a brief low-buffer pause retries play without clearing buffered media", async () => {
  const from = source.indexOf("async function probeCompanionPlaylist() {");
  const to = source.indexOf("function companionPresentationDateMs", from);
  let loads = 0;
  let plays = 0;
  const video = {
    src: originalUrl, error: null, paused: true, ended: false, readyState: 2,
    style: { display: "none" },
    load() { loads++; },
    async play() { plays++; throw new Error("waiting for a segment"); },
  };
  const ctx: Record<string, unknown> = {
    companionModeActive: true,
    companionUserPaused: false, state: { takeover: false },
    companionVideoStarted: true, companionPlaybackArmed: true,
    companionStreamId: "same-stream", companionBufferedSeconds: 20,
    companionDelaySeconds: 20, companionLastProgressAt: Date.now() - 1_000,
    companionLastRecoveryLoadAt: 0, companionLastUserMediaInteractionAt: 0,
    companionSeekPending: false, companionPhase: "buffering",
    $: (id: string) => ({ mediaVideo: video } as Record<string, unknown>)[id],
    updateCompanionPreparingUi() {},
    companionPlaylistUrl: () => "https://example.test/playlist",
    fetch: async () => ({ ok: true, text: async () =>
      "#EXTM3U\n#TONGPING-STREAM-ID:same-stream\n#EXTINF:2,\none.m4s\n#EXTINF:2,\ntwo.m4s\n"
    }),
    parseCompanionTimelineMetadata() {}, renderCompanionTimeline() {},
    scheduleCompanionProbe() {}, render() {}, setNudgeStatus() {}, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(from, to).split(String.fromCharCode(92, 92)).join(String.fromCharCode(92)), ctx);
  await (ctx.probeCompanionPlaylist as () => Promise<void>)();
  await (ctx.probeCompanionPlaylist as () => Promise<void>)();
  assert.equal(video.src, originalUrl);
  assert.equal(loads, 0);
  assert.equal(plays, 2);
});


test("a new HLS generation drops the stale playback position on the same URL", async () => {
  const from = source.indexOf("async function probeCompanionPlaylist() {");
  const to = source.indexOf("function companionPresentationDateMs", from);
  let loads = 0;
  const video = {
    src: originalUrl, currentTime: 127, error: null, paused: true,
    ended: false, readyState: 2, style: { display: "none" },
    load() { loads++; this.currentTime = 0; this.readyState = 2; },
    async play() { this.paused = false; },
  };
  const ctx: Record<string, unknown> = {
    companionModeActive: true,
    companionUserPaused: false, state: { takeover: false },
    companionVideoStarted: true, companionPlaybackArmed: true,
    companionStreamId: "old-stream", companionBufferedSeconds: 20,
    companionDelaySeconds: 20, companionLastProgressTime: 127,
    companionLastProgressAt: Date.now() - 10_000,
    companionLastRecoveryLoadAt: 0, companionLastUserMediaInteractionAt: 0,
    companionSeekPending: false,
    $: (id: string) => ({ mediaVideo: video } as Record<string, unknown>)[id],
    updateCompanionPreparingUi() {},
    companionPlaylistUrl: () => "https://example.test/playlist",
    fetch: async () => ({ ok: true, text: async () =>
      "#EXTM3U\n#TONGPING-STREAM-ID:new-stream\n#EXTINF:2,\none.m4s\n#EXTINF:2,\ntwo.m4s\n"
    }),
    parseCompanionTimelineMetadata() {}, renderCompanionTimeline() {},
    scheduleCompanionProbe() {}, render() {}, setNudgeStatus() {}, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(from, to).split(String.fromCharCode(92, 92)).join(String.fromCharCode(92)), ctx);
  await (ctx.probeCompanionPlaylist as () => Promise<void>)();
  assert.equal(video.src, originalUrl);
  assert.equal(loads, 1);
  assert.equal(video.currentTime, 0);
  assert.equal(ctx.companionLastProgressTime, 0);
});
