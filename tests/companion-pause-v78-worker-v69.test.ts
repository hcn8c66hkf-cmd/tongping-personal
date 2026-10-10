import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DelayedCompanionHls } from "../src/delayed-companion-hls.js";
import { MediaWsHub } from "../src/media-ws-hub.js";

const read = (name: string) =>
  fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("companion_pause from the watching card reaches the daemon", () => {
  const pauses: Array<[string, boolean]> = [];
  const hub = new MediaWsHub({
    authenticateWorker: () => true,
    authenticateApp: () => true,
    onCompanionPause: (profile, paused) => pauses.push([profile, paused]),
  });
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number;
    close: () => void;
  };
  ws.readyState = 1;
  ws.close = () => {};
  (hub as unknown as {
    acceptApp: (p: string, w: typeof ws, a: { build: number; exp: number }) => void;
  }).acceptApp("gpt-self", ws, { build: 78, exp: 1 });
  const send = (message: unknown) =>
    ws.emit("message", Buffer.from(JSON.stringify(message)), false);
  // Not in companion mode yet: ignored.
  send({ type: "companion_pause", paused: true });
  send({ type: "companion_ready", appUiBuild: "v93", entry: "1" });
  send({ type: "companion_pause", paused: true });
  send({ type: "companion_pause", paused: false });
  assert.deepEqual(pauses, [["gpt-self", true], ["gpt-self", false]]);
  hub.close();
});

test("no source samples are taken while paused; later samples keep the wall clock", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tongping-pause-"));
  const hls = new DelayedCompanionHls(root);
  try {
    await hls.start("p", "s1", "video/webm;codecs=vp8,opus");
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      hls.noteSourceTimeline("p", { sourcePts: 10, sourceDuration: 60, wallClockMs: now, playbackRate: 1 });
      hls.setPaused("p", true);
      assert.equal(hls.isPaused("p"), true);
      now += 30_000;
      // Sampling while paused is ignored.
      hls.noteSourceTimeline("p", { sourcePts: 10, sourceDuration: 60, wallClockMs: now, playbackRate: 0 });
      hls.setPaused("p", false);
      now += 3_000;
      hls.noteSourceTimeline("p", { sourcePts: 13, sourceDuration: 60, wallClockMs: now, playbackRate: 1 });
      const samples = (hls as unknown as {
        sessions: Map<string, { sourceSamples: Array<{ wallClockMs: number; sourcePts: number }> }>;
      }).sessions.get("p")!.sourceSamples;
      assert.deepEqual(
        samples.map((sample) => [sample.wallClockMs, sample.sourcePts]),
        [[1_000_000, 10], [1_033_000, 13]],
      );
      const row = (hls.status().sessions as Array<{ paused: boolean }>)[0]!;
      assert.equal(row.paused, false);
    } finally {
      Date.now = realNow;
    }
  } finally {
    await hls.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pause holds the source and the recorder, and keepalive respects the hold", () => {
  const manager = read("browser-manager.ts");
  assert.match(manager, /async pauseLiveMedia\(/);
  assert.match(manager, /recorder\.pause\(\)/);
  assert.match(manager, /recorder\.resume\(\)/);
  assert.match(manager, /if \(root\.__tongpingCompanionHold\) return;/);
  const worker = read("worker-client.ts");
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /command\.action === "human_media_pause"/);
  const daemon = read("daemon.ts");
  assert.match(daemon, /workerBuildAtLeast\(lastWorkerBuild, 69\)/);
  assert.match(daemon, /companionPausedProfiles\.has\(profile\)\) continue;/);
});

test("the app never auto-plays over the viewer's own pause", () => {
  const app = read("browser-app.ts");
  assert.match(app, /id="companionPause"/);
  assert.match(app, /addEventListener\("pause", \(\) => \{\n  if \(!companionModeActive \|\| companionUserPaused\) return;/);
  assert.match(app, /if \(companionUserPaused\) \{\n      scheduleCompanionProbe\(1500\);/);
  assert.match(app, /!companionVideoStarted \|\| companionUserPaused\) return;/);
  assert.match(app, /if \(companionModeActive && companionUserPaused\) sendCompanionPause\(\);/);
});
