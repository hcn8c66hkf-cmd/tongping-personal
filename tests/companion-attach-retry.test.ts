import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("ok command with attached=false is not treated as primed companion capture", () => {
  assert.ok(daemon.includes("const attached = reply.ok && result?.attached === true;"));
  assert.ok(daemon.includes('companion capture not attached'));
  assert.match(
    daemon,
    /if \(!attached\) \{[\s\S]*mediaPrimedProfiles\.delete\(profile\);[\s\S]*companionMediaProfiles\.delete\(profile\);[\s\S]*scheduleCompanionRetry\(profile\);/
  );
});

test("companion attach retry backs off, then keeps a slow retry while a card watches", () => {
  assert.ok(daemon.includes("const COMPANION_RETRY_DELAYS_MS = [750, 1_500, 3_000, 5_000, 8_000];"));
  assert.ok(daemon.includes("const COMPANION_SLOW_RETRY_MS = 10_000;"));
  assert.ok(daemon.includes("COMPANION_RETRY_DELAYS_MS[attempt] ?? COMPANION_SLOW_RETRY_MS"));
  assert.ok(!daemon.includes("if (attempt >= COMPANION_RETRY_DELAYS_MS.length) return;"));
  // Each retry still requires a card that is actually in companion mode.
  assert.ok(daemon.includes('mediaWsHub.appMode(profile) !== "companion"'));
});

test("successful attach and companion close clear pending retry state", () => {
  assert.ok(daemon.includes("clearCompanionRetry(profile);"));
  assert.match(daemon, /if \(!attached\)[\s\S]*else \{\s*clearCompanionRetry\(profile\);/);
});


test("worker poll cannot bypass a pending companion retry timer", () => {
  assert.ok(daemon.includes("(!force && companionRetryTimers.has(profile))"));
});

test("fresh companion_ready may explicitly re-arm a bounded retry cycle", () => {
  assert.ok(daemon.includes("primeCompanionMediaProfile(profile, true);"));
  assert.match(
    daemon,
    /if \(force\) \{\s*clearCompanionRetry\(profile\);\s*\}/
  );
});

test("worker media socket loss does not erase retry budget", () => {
  const start = daemon.indexOf("onWorkerPresence:");
  const end = daemon.indexOf("onAppReady:", start);
  const block = daemon.slice(start, end);
  assert.ok(!block.includes("clearCompanionRetry(profile)"));
});
