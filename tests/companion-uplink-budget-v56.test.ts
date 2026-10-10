import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(
  new URL("../src/worker-client.ts", import.meta.url),
  "utf8",
);
const staged = fs.readFileSync(
  new URL("../src/worker-client.ts", import.meta.url),
  "utf8",
);

test("companion has HQ trial plus constrained-uplink SAFE fallback", () => {
  for (const text of [worker, staged]) {
    assert.ok(text.includes("videoBitsPerSecond: companionQualityDegraded.has(profile)"));
    assert.ok(text.includes("? 900_000"));
    assert.ok(text.includes(": 2_000_000"));
    assert.ok(text.includes("audioBitsPerSecond: companionQualityDegraded.has(profile)"));
    assert.ok(text.includes("? 64_000"));
    assert.ok(text.includes(": 96_000"));
    assert.ok(text.includes("companionQualityDegraded.add(profile)"));
    assert.ok(text.includes("companionQualityDegraded.delete(profile)"));
    // v89 changed only the hosted media lane; the personal staged copy stays v88.
    assert.ok(text.includes(text === worker ? 'const WORKER_BUILD = "v95";' : 'const WORKER_BUILD = "v88";'));
  }
});

test("companion uses a larger ordered-upload backpressure budget", () => {
  for (const text of [worker, staged]) {
    assert.ok(text.includes('mediaModes.get(profile) === "companion"'));
    assert.ok(text.includes("? 4_000_000"));
    assert.ok(text.includes(": 256_000"));
  }
});
