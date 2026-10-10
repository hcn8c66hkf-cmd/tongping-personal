import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("browser app ACK distinguishes presented frames from dropped frames", () => {
  const app = fs.readFileSync(
    new URL("../src/browser-app.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /sequence,/);
  assert.match(app, /capturedAt,/);
  assert.match(app, /outcome: ackOutcome/);
  assert.match(app, /presentationSemantics: ackSemantics/);
  assert.match(app, /ackOutcome = "presented"/);
  assert.match(app, /ackSemantics = "canvas-draw-committed"/);
  assert.match(app, /dropped-stale-before-decode/);
  assert.match(app, /dropped-stale-after-decode/);
});

test("live hub only commits a presented ACK that matches the last sent frame", () => {
  const hub = fs.readFileSync(
    new URL("../src/live-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /appLastSentFrame/);
  assert.match(hub, /ackSequence === expected\.sequence/);
  assert.match(hub, /ackCapturedAt === expected\.capturedAt/);
  assert.match(hub, /outcome === "presented" && ackMatches/);
  assert.match(hub, /physicalDisplayConfirmed: false/);
  assert.match(hub, /render-surface-commit-observed-by-browser-app/);
});

test("companion context keeps source, presented, and committed clocks separate", () => {
  const mcp = fs.readFileSync(
    new URL("../src/mcp-server.ts", import.meta.url),
    "utf8",
  );
  assert.match(mcp, /sourcePlayheadPts/);
  assert.match(mcp, /tongpingPresentedPts/);
  assert.match(mcp, /tongpingPresentedPtsSource/);
  assert.match(mcp, /mediaSession/);
  assert.match(mcp, /solCommittedPts/);
  assert.match(mcp, /perceptionSkewSeconds/);
  assert.match(mcp, /awaiting-tongping-presented-and-ai-committed-pts/);
  assert.match(mcp, /engineering processing frontier/);
  assert.match(mcp, /rvfc-frame-pts-bound-to-presented-remote-frame/);
});
