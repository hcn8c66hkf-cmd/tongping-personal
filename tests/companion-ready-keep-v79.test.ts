import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { companionHlsSessionHealthy } from "../src/companion-hls-recovery.js";

test("a producing capture counts as healthy; stalled or exited does not", () => {
  const base = { exited: false, ageMs: 40_000, chunksIn: 37 };
  assert.equal(companionHlsSessionHealthy({ ...base, lastChunkAgeMs: 1_100 }), true);
  assert.equal(companionHlsSessionHealthy({ ...base, lastChunkAgeMs: 6_000 }), false);
  assert.equal(companionHlsSessionHealthy({ ...base, lastChunkAgeMs: null }), false);
  assert.equal(companionHlsSessionHealthy({ ...base, chunksIn: 0, lastChunkAgeMs: 0 }), false);
  assert.equal(companionHlsSessionHealthy({ ...base, exited: true, lastChunkAgeMs: 0 }), false);
});

test("companion_ready from a replacement viewer keeps a producing capture", () => {
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
  const ready = daemon.slice(daemon.indexOf("onCompanionReady:"));
  const guard = ready.indexOf("if (producing && !freshEntry) return;");
  const restart = ready.indexOf("primeCompanionMediaProfile(profile, true);");
  assert.ok(ready.indexOf("const producing = companionCaptureProducing(profile);") > 0);
  assert.ok(guard > 0 && guard < restart);
});
