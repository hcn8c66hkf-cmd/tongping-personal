import assert from "node:assert/strict";
import test from "node:test";

import { gateSubtitleCues } from "../src/media-context.js";

test("subtitle gate never returns future-starting cues", () => {
  const result = gateSubtitleCues(
    [
      { startTime: 8, endTime: 10, text: "past" },
      { startTime: 10, endTime: 12, text: "current" },
      { startTime: 10.001, endTime: 13, text: "future" },
    ],
    10,
    120,
    20,
  );

  assert.deepEqual(result.map((cue) => cue.text), ["past", "current"]);
  assert.equal(result.some((cue) => cue.startTime > 10), false);
});

test("subtitle gate applies lookback and max cue bounds", () => {
  const cues = Array.from({ length: 20 }, (_, index) => ({
    startTime: index,
    endTime: index + 0.8,
    text: "cue-" + index,
  }));

  const result = gateSubtitleCues(cues, 19, 5, 3);
  assert.deepEqual(result.map((cue) => cue.text), ["cue-17", "cue-18", "cue-19"]);
});

test("subtitle gate strips markup and normalizes text", () => {
  const [cue] = gateSubtitleCues(
    [{ startTime: 1, endTime: 2, text: "<i>Hello</i>   the user" }],
    2,
    10,
    10,
  );
  assert.equal(cue?.text, "Hello the user");
});
