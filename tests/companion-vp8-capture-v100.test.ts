import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("companion capture uses VP8 WebM before the daemon transcodes to HLS", () => {
  const worker = fs.readFileSync(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  const companionOptions = worker.slice(
    worker.indexOf('mode === "companion"'),
    worker.indexOf("        : {},", worker.indexOf('mode === "companion"')),
  );

  assert.match(companionOptions, /preferH264:\s*false/);
  assert.doesNotMatch(companionOptions, /preferH264:\s*true/);
});
