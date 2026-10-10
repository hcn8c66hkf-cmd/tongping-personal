import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("live diagnostics expose capture and render pacing without changing transport", () => {
  const hub = fs.readFileSync(new URL("../src/live-ws-hub.ts", import.meta.url), "utf8");
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

  assert.match(hub, /catchupSends/);
  assert.match(hub, /nextFrameCredits/);
  assert.match(hub, /avgRenderAckMs/);
  assert.match(hub, /appLastFrameSentAt/);
  assert.match(hub, /workerFrameReceiptStats/);
  assert.match(hub, /workerTransportDiag/);
  assert.match(hub, /type: "frame_received"/);
  assert.match(hub, /parseWorkerTransportDiag/);
  assert.match(daemon, /captureClockBaselineMs/);
  assert.match(daemon, /lastCaptureTransitMs/);
  assert.match(daemon, /avgCaptureTransitMs/);
  assert.match(daemon, /maxCaptureTransitMs/);
});
