import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("audio hub batches decoded PCM to about 100ms before mobile playback", () => {
  const hub = fs.readFileSync(
    new URL("../src/audio-ws-hub.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /Math\.round\(chunk\.sampleRate \* 0\.1\)/);
  assert.match(hub, /queueAppPcmChunk/);
  assert.match(hub, /Buffer\.concat\(batch\.buffers\)/);
  assert.match(hub, /batch\.appSequence \+= 1/);
  assert.match(hub, /frames: batch\.frames/);
});
