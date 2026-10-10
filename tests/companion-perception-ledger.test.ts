import test from "node:test";
import assert from "node:assert/strict";
import {
  CompanionPerceptionLedger,
  coverageSummary,
} from "../src/companion-perception-ledger.js";

const session = (epoch = 1, mediaIdentity = "episode-1") => ({
  sessionId: "session-a",
  playerIdentity: "player-a",
  mediaIdentity,
  epoch,
});

test("committed context coverage advances only through continuous intervals", () => {
  const ledger = new CompanionPerceptionLedger();
  const first = ledger.issue({
    profile: "default",
    session: session(),
    observedAtPts: 5,
    source: "companion-context",
    coverage: {
      context: [{ startPts: 0, endPts: 5 }],
      audio: [{ startPts: 0, endPts: 5 }],
    },
  }, 1000);
  ledger.commit(first.packetId, {}, 1100);

  const later = ledger.issue({
    profile: "default",
    session: session(),
    observedAtPts: 12,
    source: "companion-context",
    coverage: {
      context: [{ startPts: 9, endPts: 12 }],
      audio: [{ startPts: 9, endPts: 12 }],
    },
  }, 1200);
  ledger.commit(later.packetId, {}, 1300);

  const status = ledger.status("default");
  assert.equal(status.solCommittedPts, 5);
  assert.equal(status.contextCoverage.maxCoveredPts, 12);
  assert.deepEqual(status.contextCoverage.gaps, [
    { startPts: 5, endPts: 9 },
  ]);
});

test("late result from a previous epoch is invalidated at commit", () => {
  const ledger = new CompanionPerceptionLedger();
  const old = ledger.issue({
    profile: "default",
    session: session(1),
    observedAtPts: 20,
    source: "companion-context",
    coverage: {
      context: [{ startPts: 15, endPts: 20 }],
    },
  }, 1000);

  ledger.activate("default", session(2), 50, 1050);
  assert.equal(ledger.packet(old.packetId)?.processedAt, null);
  const result = ledger.commit(old.packetId, {}, 1100);
  assert.equal(result?.processedAt, 1100);
  assert.equal(result?.committedAt, null);
  assert.equal(result?.disposition, "invalidated");
  assert.equal(result?.reason, "active-media-session-changed");
});

test("same pts from a different media identity never shares coverage", () => {
  const ledger = new CompanionPerceptionLedger();
  const a = ledger.issue({
    profile: "default",
    session: session(1, "episode-1"),
    observedAtPts: 10,
    source: "companion-context",
    coverage: { context: [{ startPts: 0, endPts: 10 }] },
  });
  ledger.commit(a.packetId);
  assert.equal(ledger.status("default").solCommittedPts, 10);

  ledger.activate("default", session(1, "episode-2"), 0);
  const status = ledger.status("default");
  assert.equal(status.activeSession?.mediaIdentity, "episode-2");
  assert.equal(status.solCommittedPts, null);
});

test("processed stale work does not become committed work", () => {
  const ledger = new CompanionPerceptionLedger();
  const receipt = ledger.issue({
    profile: "default",
    session: session(),
    observedAtPts: 3,
    source: "companion-context",
    coverage: { context: [{ startPts: 0, endPts: 3 }] },
  }, 100);
  ledger.activate("default", session(2), 10, 200);

  const stale = ledger.commit(receipt.packetId, {}, 300);
  assert.equal(stale?.disposition, "invalidated");
  assert.equal(stale?.committedAt, null);
  const status = ledger.status("default");
  assert.equal(status.packetCounts.processed, 1);
  assert.equal(status.packetCounts.committed, 0);
});

test("attempt mismatch is dropped and cannot advance coverage", () => {
  const ledger = new CompanionPerceptionLedger();
  const receipt = ledger.issue({
    profile: "default",
    session: session(),
    observedAtPts: 4,
    source: "companion-context",
    coverage: { context: [{ startPts: 0, endPts: 4 }] },
  });
  const result = ledger.commit(receipt.packetId, {
    attemptId: "wrong-attempt",
  });
  assert.equal(result?.disposition, "dropped");
  assert.equal(ledger.status("default").solCommittedPts, null);
});

test("modality coverage remains distinct from aggregate context coverage", () => {
  const ledger = new CompanionPerceptionLedger();
  const receipt = ledger.issue({
    profile: "default",
    session: session(),
    observedAtPts: 8,
    source: "companion-context",
    coverage: {
      context: [{ startPts: 4, endPts: 8 }],
      subtitle: [{ startPts: 4, endPts: 5 }],
      audio: [{ startPts: 4, endPts: 8 }],
    },
    missing: {
      visual: "not-inspected-in-context",
    },
  });
  ledger.commit(receipt.packetId);

  const status = ledger.status("default");
  assert.equal(status.solCommittedPts, 8);
  assert.equal(status.modalityCoverage.subtitle.frontierPts, 5);
  assert.equal(status.modalityCoverage.audio.frontierPts, 8);
  assert.equal(status.modalityCoverage.visual.frontierPts, null);
});

test("coverage summary exposes later islands without falsely moving frontier", () => {
  const summary = coverageSummary([
    { startPts: 0, endPts: 5 },
    { startPts: 9, endPts: 12 },
  ], 0);
  assert.equal(summary.frontierPts, 5);
  assert.equal(summary.maxCoveredPts, 12);
  assert.deepEqual(summary.gaps, [{ startPts: 5, endPts: 9 }]);
});


test("frontier is null when no committed interval actually reaches the session anchor", () => {
  const summary = coverageSummary([
    { startPts: 19, endPts: 21 },
    { startPts: 65.5, endPts: 65.5 },
  ], 63.8);
  assert.equal(summary.frontierPts, null);
  assert.equal(summary.maxCoveredPts, 65.5);
  assert.deepEqual(summary.gaps, [
    { startPts: 63.8, endPts: 65.5 },
  ]);
});

test("intervals entirely before the anchor do not fabricate committed progress", () => {
  const summary = coverageSummary([
    { startPts: 10, endPts: 20 },
  ], 50);
  assert.equal(summary.frontierPts, null);
  assert.equal(summary.maxCoveredPts, 20);
  assert.deepEqual(summary.gaps, []);
});
