import test from "node:test";
import assert from "node:assert/strict";
import { assessCompanionVisualCue } from "../src/companion-policy.js";

const media = (currentTime: number, endTime: number) => ({
  media: { currentTime },
  subtitles: [{ startTime: Math.max(0, endTime - 2), endTime, text: "line" }],
});

test("long subtitle silence suggests a medium-priority visual check", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: media(20, 14),
    audioVision: { events: [] },
    now: 10_000,
  });
  assert.equal(cue.shouldLook, true);
  assert.equal(cue.priority, "medium");
  assert.equal(cue.silenceSeconds, 6);
  assert.equal(cue.longSilence, true);
});

test("audio section shift suggests a visual check without subtitle silence", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: media(20, 19.5),
    audioVision: {
      events: [{
        type: "section_change",
        energyDelta: 0.3,
        onsetDelta: 0,
        harmonicChange: 0.1,
        to: "build",
      }],
    },
    now: 10_000,
  });
  assert.equal(cue.shouldLook, true);
  assert.equal(cue.audioShift, true);
  assert.equal(cue.priority, "medium");
});

test("silence plus audio shift is high priority", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: media(20, 10),
    audioVision: {
      events: [{
        type: "section_change",
        energyDelta: 0.25,
        onsetDelta: 1.2,
        harmonicChange: 0.5,
        to: "peak",
      }],
    },
    now: 10_000,
  });
  assert.equal(cue.shouldLook, true);
  assert.equal(cue.priority, "high");
  assert.ok(cue.reasons.includes("combined-action-likelihood"));
});

test("recent visual inspection blocks silence-only repeats", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: media(20, 10),
    audioVision: { events: [] },
    lastVisualInspectionAt: 8_000,
    now: 10_000,
  });
  assert.equal(cue.shouldLook, false);
  assert.equal(cue.cooldown.active, true);
  assert.equal(cue.cooldown.secondsRemaining, 2);
});

test("strong audio shift may bypass visual cooldown", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: media(20, 19.5),
    audioVision: {
      events: [{
        type: "section_change",
        energyDelta: 0.4,
        onsetDelta: 0,
        harmonicChange: 0.2,
        to: "peak",
      }],
    },
    lastVisualInspectionAt: 8_000,
    now: 10_000,
  });
  assert.equal(cue.shouldLook, true);
  assert.equal(cue.cooldown.bypassedByAudioShift, true);
});


test("video without subtitle source gets a low-frequency visual heartbeat", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: {
      media: { tag: "video", currentTime: 30, paused: false },
      subtitles: [],
      source: "none",
    },
    audioVision: { events: [] },
    lastVisualInspectionAt: 0,
    now: 11_000,
  });
  assert.equal(cue.noSubtitleSource, true);
  assert.equal(cue.visualHeartbeat, true);
  assert.equal(cue.shouldLook, true);
  assert.equal(cue.priority, "medium");
  assert.ok(cue.reasons.includes("subtitle-source-unavailable"));
  assert.ok(cue.reasons.includes("visual-heartbeat"));
});

test("no-subtitle heartbeat waits ten seconds after a real visual inspection", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: {
      media: { tag: "video", currentTime: 30, paused: false },
      subtitles: [],
      source: "none",
    },
    audioVision: { events: [] },
    lastVisualInspectionAt: 5_000,
    now: 11_000,
  });
  assert.equal(cue.visualHeartbeat, false);
  assert.equal(cue.shouldLook, false);
});

test("paused video does not generate no-subtitle visual heartbeat", () => {
  const cue = assessCompanionVisualCue({
    mediaContext: {
      media: { tag: "video", currentTime: 30, paused: true },
      subtitles: [],
      source: "none",
    },
    audioVision: { events: [] },
    now: 11_000,
  });
  assert.equal(cue.noSubtitleSource, false);
  assert.equal(cue.visualHeartbeat, false);
});
