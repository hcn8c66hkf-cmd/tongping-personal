import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { companionHlsRecoveryReason } from "../src/companion-hls-recovery.js";

test("live ffmpeg with stalled incoming media is recovered but short gaps are tolerated", () => {
  const now = 100_000;
  const base = { exited: false, ageMs: 25_000, chunksIn: 13 };
  assert.equal(companionHlsRecoveryReason({ ...base, lastChunkAgeMs: 12_000 }, now, 0), "stalled");
  assert.equal(companionHlsRecoveryReason({ ...base, lastChunkAgeMs: 4_000 }, now, 0), null);
  assert.equal(companionHlsRecoveryReason({ ...base, ageMs: 8_000, lastChunkAgeMs: 12_000 }, now, 0), null);
  assert.equal(companionHlsRecoveryReason({ ...base, chunksIn: 0, lastChunkAgeMs: null }, now, 0), null);
  assert.equal(companionHlsRecoveryReason({ ...base, lastChunkAgeMs: 12_000 }, now, now - 5_000), null);
  assert.equal(companionHlsRecoveryReason({ ...base, exited: true, lastChunkAgeMs: 0 }, now, 0), "exited");
});


test("daemon watchdog uses stalled-input detection, not only process exit", () => {
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
  assert.match(daemon, /companionHlsRecoveryReason\(row, now, lastAttemptAt\)/);
});
