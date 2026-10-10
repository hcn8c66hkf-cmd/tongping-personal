import test from "node:test";
import assert from "node:assert/strict";
import { buildCompanionContextCoverage } from "../src/mcp-server.js";

test("capture-stream audio mediaTime is not committed as canonical video PTS", () => {
  const result = buildCompanionContextCoverage(
    {
      source: "none",
      subtitles: [],
    },
    {
      ready: true,
      timeline: [
        { mediaTime: 19.4 },
        { mediaTime: 21.4 },
      ],
    },
    65.5,
  );

  assert.deepEqual(result.coverage.context, [
    { startPts: 65.5, endPts: 65.5 },
  ]);
  assert.equal(result.coverage.audio, undefined);
  assert.equal(
    result.missing?.audio,
    "audio-present-but-canonical-pts-unmapped",
  );
});

test("subtitle cue time remains canonical media coverage", () => {
  const result = buildCompanionContextCoverage(
    {
      source: "html-media-text-tracks",
      subtitles: [
        { startTime: 63, endTime: 64.5 },
        { startTime: 64.5, endTime: 65.5 },
      ],
    },
    {
      ready: false,
      timeline: [],
    },
    65.5,
  );

  assert.deepEqual(result.coverage.subtitle, [
    { startPts: 63, endPts: 65.5 },
  ]);
  assert.deepEqual(result.coverage.context, [
    { startPts: 63, endPts: 65.5 },
  ]);
});
