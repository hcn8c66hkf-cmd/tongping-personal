import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
const mcp = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");

test("ordinary LIVE priming is blocked while companion authority is active", () => {
  const start = daemon.indexOf("function primeLiveProfile(");
  const end = daemon.indexOf("function stopLiveProfileIfIdle(", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("companionAuthorityActive(profile)"));
  assert.ok(!block.includes("allowDuringCompanion"));
});

test("entering companion explicitly stops current LIVE worker capture", () => {
  const start = daemon.indexOf("onCompanionReady:");
  const end = daemon.indexOf("onAppModeClosed:", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("stopLiveProfileForCompanion(profile)"));
  assert.ok(daemon.includes('"companion-live-stop"'));
});

test("AI companion perception cannot temporarily re-enable LIVE", () => {
  assert.ok(!daemon.includes("renewCompanionLiveLease"));
  assert.ok(!daemon.includes("companionLeaseActive"));
  assert.ok(!mcp.includes("onCompanionActivity"));
});

test("companion authority ignores stale LIVE subscribers when deciding to stop LIVE", () => {
  const start = daemon.indexOf("function stopLiveProfileIfIdle(");
  const end = daemon.indexOf("function stopLiveProfileForCompanion(", start);
  const block = daemon.slice(start, end);
  assert.ok(block.includes("const companionActive = companionAuthorityActive(profile)"));
  assert.ok(block.includes("(!companionActive && liveWsHub.appSubscribers(profile) !== 0)"));
});
