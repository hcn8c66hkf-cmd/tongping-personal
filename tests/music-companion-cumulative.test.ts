import test from "node:test";
import assert from "node:assert/strict";
import { MusicCompanionLedger } from "../src/music-companion-ledger.js";
import type { AudioVisionReadout } from "../src/audio-vision.js";

function audio(times: number[]): AudioVisionReadout {
  return {
    ready: true,
    profile: "default",
    seconds: 30,
    latest: null,
    timeline: times.map((mediaTime, index) => ({
      capturedAt: index * 1000,
      mediaTime,
      loudnessDb: -20,
      energy: 0.5,
      bass: 0.3,
      mid: 0.4,
      treble: 0.3,
      spectralCentroidHz: 1200,
      brightness: 0.2,
      onsetDensity: 1,
      pitchHz: 440,
      pitchConfidence: 0.8,
      chroma: Array(12).fill(0),
      key: "A",
      keyConfidence: 0.7,
      harmonicChange: 0.1,
      bpm: 100,
      beatPhase: 0,
      state: "steady",
    })),
    events: [],
    sectionRibbon: [],
    summary: {
      state: "steady",
      bpm: 100,
      key: "A",
      energy: 0.5,
      brightness: 0.2,
      rhythmicDensity: 1,
      harmonicChange: 0.1,
    },
  };
}

test("music history accumulates already-heard audio instead of rolling it away", () => {
  const ledger = new MusicCompanionLedger();
  ledger.merge("song", 30, audio([0, 10, 20, 30]), []);
  const later = ledger.merge("song", 90, audio([60, 70, 80, 90]), []);
  assert.deepEqual(later.audioTimeline.map((point) => point.mediaTime), [0, 10, 20, 30, 60, 70, 80, 90]);
  assert.equal(later.coverage.startMediaTime, 0);
  assert.equal(later.coverage.endMediaTime, 90);
});

test("seek backward seals accumulated future music and lyrics", () => {
  const ledger = new MusicCompanionLedger();
  ledger.merge("song", 90, audio([10, 40, 70, 90]), [
    { startTime: 12, endTime: 16, text: "first", track: "lyrics", language: "en" },
    { startTime: 72, endTime: 76, text: "future-after-seek", track: "lyrics", language: "en" },
  ]);
  const rewound = ledger.merge("song", 45, audio([40]), []);
  assert.deepEqual(rewound.audioTimeline.map((point) => point.mediaTime), [10, 40]);
  assert.deepEqual(rewound.lyrics.map((cue) => cue.text), ["first"]);
  assert.equal(rewound.futureSealed, true);
});

test("different song sessions never share accumulated context", () => {
  const ledger = new MusicCompanionLedger();
  ledger.merge("song-a", 30, audio([10, 20]), []);
  const other = ledger.merge("song-b", 5, audio([5]), []);
  assert.deepEqual(other.audioTimeline.map((point) => point.mediaTime), [5]);
});
