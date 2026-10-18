import { randomUUID } from "node:crypto";

export type CompanionCoverageModality =
  | "context"
  | "subtitle"
  | "audio"
  | "visual"
  | "metadata";

export interface CompanionMediaSessionIdentity {
  sessionId: string;
  playerIdentity: string;
  mediaIdentity: string;
  epoch: number;
}

export interface CompanionCoverageInterval {
  startPts: number;
  endPts: number;
}

export interface CompanionPerceptionPacketInput {
  profile: string;
  session: CompanionMediaSessionIdentity;
  observedAtPts: number;
  coverage: Partial<
    Record<CompanionCoverageModality, CompanionCoverageInterval[]>
  >;
  missing?: Partial<Record<CompanionCoverageModality, string>>;
  source: "companion-context" | "companion-frame" | "companion-tick";
  replayOf?: string | null;
}

export interface CompanionPerceptionPacketReceipt {
  packetId: string;
  attemptId: string;
  replayOf: string | null;
  profile: string;
  session: CompanionMediaSessionIdentity;
  observedAtPts: number;
  source: "companion-context" | "companion-frame" | "companion-tick";
  coverage: Partial<
    Record<CompanionCoverageModality, CompanionCoverageInterval[]>
  >;
  missing: Partial<Record<CompanionCoverageModality, string>>;
  receivedAt: number;
  processedAt: number | null;
  committedAt: number | null;
  disposition:
    | "pending"
    | "accepted"
    | "dropped"
    | "invalidated"
    | "failed";
  reason: string | null;
}

export interface CompanionPerceptionStatus {
  profile: string;
  activeSession: CompanionMediaSessionIdentity | null;
  anchorPts: number | null;
  solCommittedPts: number | null;
  solCommittedPtsStatus:
    | "unavailable"
    | "engineering-context-frontier";
  packetCounts: {
    received: number;
    processed: number;
    committed: number;
    pending: number;
    accepted: number;
    dropped: number;
    invalidated: number;
    failed: number;
  };
  contextCoverage: {
    intervals: CompanionCoverageInterval[];
    gaps: CompanionCoverageInterval[];
    frontierPts: number | null;
    maxCoveredPts: number | null;
  };
  modalityCoverage: Record<
    CompanionCoverageModality,
    {
      intervals: CompanionCoverageInterval[];
      gaps: CompanionCoverageInterval[];
      frontierPts: number | null;
      maxCoveredPts: number | null;
    }
  >;
  note: string;
}

interface SessionState {
  session: CompanionMediaSessionIdentity;
  anchorPts: number | null;
  coverage: Record<CompanionCoverageModality, CompanionCoverageInterval[]>;
}

const MODALITIES: CompanionCoverageModality[] = [
  "context",
  "subtitle",
  "audio",
  "visual",
  "metadata",
];

export class CompanionPerceptionLedger {
  private readonly activeSessionByProfile = new Map<
    string,
    CompanionMediaSessionIdentity
  >();
  private readonly sessionStates = new Map<string, SessionState>();
  private readonly packets = new Map<string, CompanionPerceptionPacketReceipt>();
  private readonly packetOrder: string[] = [];

  activate(
    profile: string,
    session: CompanionMediaSessionIdentity,
    anchorPts: number | null = null,
    now = Date.now(),
  ): void {
    const current = this.activeSessionByProfile.get(profile);
    const changed = !current || !sameSession(current, session);
    this.activeSessionByProfile.set(profile, { ...session });

    const key = sessionKey(profile, session);
    let state = this.sessionStates.get(key);
    if (!state) {
      state = {
        session: { ...session },
        anchorPts: finitePts(anchorPts),
        coverage: emptyCoverage(),
      };
      this.sessionStates.set(key, state);
    } else if (state.anchorPts === null) {
      state.anchorPts = finitePts(anchorPts);
    }

    if (!changed) return;

    for (const receipt of this.packets.values()) {
      if (
        receipt.profile !== profile ||
        receipt.disposition !== "pending" ||
        sameSession(receipt.session, session)
      ) {
        continue;
      }
      receipt.disposition = "invalidated";
      receipt.reason = "active-media-session-changed";
    }
  }

  issue(
    input: CompanionPerceptionPacketInput,
    now = Date.now(),
  ): CompanionPerceptionPacketReceipt {
    const normalizedCoverage = normalizeCoverage(input.coverage);
    const contextStart =
      normalizedCoverage.context?.[0]?.startPts ??
      minCoverageStart(normalizedCoverage) ??
      finitePts(input.observedAtPts);

    this.activate(
      input.profile,
      input.session,
      contextStart,
      now,
    );

    const receipt: CompanionPerceptionPacketReceipt = {
      packetId: randomUUID(),
      attemptId: randomUUID(),
      replayOf: input.replayOf ?? null,
      profile: input.profile,
      session: { ...input.session },
      observedAtPts: requirePts(input.observedAtPts),
      source: input.source,
      coverage: normalizedCoverage,
      missing: normalizeMissing(input.missing),
      receivedAt: now,
      processedAt: null,
      committedAt: null,
      disposition: "pending",
      reason: null,
    };
    this.packets.set(receipt.packetId, receipt);
    this.packetOrder.push(receipt.packetId);
    this.prunePacketHistory();
    return cloneReceipt(receipt);
  }

  commit(
    packetId: string,
    options: {
      modalities?: CompanionCoverageModality[];
      attemptId?: string | null;
    } = {},
    now = Date.now(),
  ): CompanionPerceptionPacketReceipt | null {
    const receipt = this.packets.get(packetId);
    if (!receipt) return null;

    if (receipt.disposition === "accepted") {
      return cloneReceipt(receipt);
    }
    if (receipt.disposition === "invalidated") {
      if (receipt.processedAt === null) receipt.processedAt = now;
      return cloneReceipt(receipt);
    }
    if (receipt.disposition !== "pending") {
      return cloneReceipt(receipt);
    }

    receipt.processedAt = now;
    if (
      options.attemptId &&
      options.attemptId !== receipt.attemptId
    ) {
      receipt.disposition = "dropped";
      receipt.reason = "attempt-id-mismatch";
      return cloneReceipt(receipt);
    }

    const active = this.activeSessionByProfile.get(receipt.profile);
    if (!active || !sameSession(active, receipt.session)) {
      receipt.disposition = "invalidated";
      receipt.reason = "stale-media-session";
      return cloneReceipt(receipt);
    }

    const key = sessionKey(receipt.profile, receipt.session);
    const state = this.sessionStates.get(key);
    if (!state) {
      receipt.disposition = "failed";
      receipt.reason = "missing-session-state";
      return cloneReceipt(receipt);
    }

    const selected = options.modalities?.length
      ? [...new Set(options.modalities)]
      : MODALITIES.filter(
          (modality) => (receipt.coverage[modality]?.length ?? 0) > 0,
        );

    for (const modality of selected) {
      const intervals = receipt.coverage[modality] ?? [];
      if (intervals.length === 0) continue;
      state.coverage[modality] = mergeIntervals([
        ...state.coverage[modality],
        ...intervals,
      ]);
      if (state.anchorPts === null) {
        state.anchorPts = intervals[0]?.startPts ?? null;
      }
    }

    receipt.committedAt = now;
    receipt.disposition = "accepted";
    receipt.reason = null;
    return cloneReceipt(receipt);
  }

  fail(
    packetId: string,
    reason: string,
    now = Date.now(),
  ): CompanionPerceptionPacketReceipt | null {
    const receipt = this.packets.get(packetId);
    if (!receipt) return null;
    if (receipt.disposition !== "pending") return cloneReceipt(receipt);
    receipt.processedAt = now;
    receipt.disposition = "failed";
    receipt.reason = reason.slice(0, 240) || "processing-failed";
    return cloneReceipt(receipt);
  }

  packet(packetId: string): CompanionPerceptionPacketReceipt | null {
    const receipt = this.packets.get(packetId);
    return receipt ? cloneReceipt(receipt) : null;
  }

  status(profile: string): CompanionPerceptionStatus {
    const active = this.activeSessionByProfile.get(profile) ?? null;
    const state = active
      ? this.sessionStates.get(sessionKey(profile, active)) ?? null
      : null;

    const packetValues = [...this.packets.values()].filter(
      (packet) => packet.profile === profile,
    );
    const packetCounts = {
      received: packetValues.length,
      processed: packetValues.filter((packet) => packet.processedAt !== null)
        .length,
      committed: packetValues.filter((packet) => packet.committedAt !== null)
        .length,
      pending: packetValues.filter((packet) => packet.disposition === "pending")
        .length,
      accepted: packetValues.filter(
        (packet) => packet.disposition === "accepted",
      ).length,
      dropped: packetValues.filter(
        (packet) => packet.disposition === "dropped",
      ).length,
      invalidated: packetValues.filter(
        (packet) => packet.disposition === "invalidated",
      ).length,
      failed: packetValues.filter((packet) => packet.disposition === "failed")
        .length,
    };

    const modalityCoverage = Object.fromEntries(
      MODALITIES.map((modality) => {
        const intervals = state?.coverage[modality] ?? [];
        return [
          modality,
          coverageSummary(intervals, state?.anchorPts ?? null),
        ];
      }),
    ) as CompanionPerceptionStatus["modalityCoverage"];

    const contextCoverage = modalityCoverage.context;
    return {
      profile,
      activeSession: active ? { ...active } : null,
      anchorPts: state?.anchorPts ?? null,
      solCommittedPts: contextCoverage.frontierPts,
      solCommittedPtsStatus:
        contextCoverage.frontierPts === null
          ? "unavailable"
          : "engineering-context-frontier",
      packetCounts,
      contextCoverage,
      modalityCoverage,
      note:
        "solCommittedPts is an engineering processing frontier over explicitly committed context coverage. It does not claim semantic understanding correctness.",
    };
  }

  reset(profile?: string): void {
    if (!profile) {
      this.activeSessionByProfile.clear();
      this.sessionStates.clear();
      this.packets.clear();
      this.packetOrder.length = 0;
      return;
    }

    this.activeSessionByProfile.delete(profile);
    for (const key of [...this.sessionStates.keys()]) {
      if (key.startsWith(profile + "\u0000")) {
        this.sessionStates.delete(key);
      }
    }
    for (const [packetId, receipt] of this.packets) {
      if (receipt.profile === profile) this.packets.delete(packetId);
    }
    for (let i = this.packetOrder.length - 1; i >= 0; i -= 1) {
      const id = this.packetOrder[i];
      if (!id || !this.packets.has(id)) this.packetOrder.splice(i, 1);
    }
  }

  private prunePacketHistory(): void {
    const MAX_PACKETS = 2_000;
    while (this.packetOrder.length > MAX_PACKETS) {
      const oldest = this.packetOrder.shift();
      if (oldest) this.packets.delete(oldest);
    }
  }
}

export function mergeIntervals(
  intervals: CompanionCoverageInterval[],
  epsilon = 0.05,
): CompanionCoverageInterval[] {
  const sorted = intervals
    .map(normalizeInterval)
    .filter(
      (value): value is CompanionCoverageInterval => value !== null,
    )
    .sort((a, b) => a.startPts - b.startPts || a.endPts - b.endPts);
  const merged: CompanionCoverageInterval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.startPts > last.endPts + epsilon) {
      merged.push({ ...interval });
      continue;
    }
    last.endPts = Math.max(last.endPts, interval.endPts);
  }
  return merged;
}

export function coverageSummary(
  intervals: CompanionCoverageInterval[],
  anchorPts: number | null,
): {
  intervals: CompanionCoverageInterval[];
  gaps: CompanionCoverageInterval[];
  frontierPts: number | null;
  maxCoveredPts: number | null;
} {
  const merged = mergeIntervals(intervals);
  const maxCoveredPts = merged.length
    ? merged[merged.length - 1]!.endPts
    : null;
  const anchor = finitePts(anchorPts);
  if (anchor === null || merged.length === 0) {
    return {
      intervals: merged,
      gaps: [],
      frontierPts: null,
      maxCoveredPts,
    };
  }

  let frontier: number | null = null;
  const gaps: CompanionCoverageInterval[] = [];
  for (const interval of merged) {
    if (interval.endPts < anchor - 0.05) continue;

    if (frontier === null) {
      if (
        interval.startPts <= anchor + 0.05 &&
        interval.endPts >= anchor - 0.05
      ) {
        frontier = Math.max(anchor, interval.endPts);
      } else if (interval.startPts > anchor + 0.05) {
        gaps.push({
          startPts: anchor,
          endPts: interval.startPts,
        });
      }
      continue;
    }

    if (interval.startPts > frontier + 0.05) {
      gaps.push({
        startPts: frontier,
        endPts: interval.startPts,
      });
      continue;
    }
    frontier = Math.max(frontier, interval.endPts);
  }
  return {
    intervals: merged,
    gaps,
    frontierPts: frontier,
    maxCoveredPts,
  };
}

function normalizeCoverage(
  coverage: CompanionPerceptionPacketInput["coverage"],
): CompanionPerceptionPacketReceipt["coverage"] {
  const result: CompanionPerceptionPacketReceipt["coverage"] = {};
  for (const modality of MODALITIES) {
    const values = coverage[modality] ?? [];
    const merged = mergeIntervals(values);
    if (merged.length > 0) result[modality] = merged;
  }
  return result;
}

function normalizeMissing(
  missing: CompanionPerceptionPacketInput["missing"],
): CompanionPerceptionPacketReceipt["missing"] {
  const result: CompanionPerceptionPacketReceipt["missing"] = {};
  if (!missing) return result;
  for (const modality of MODALITIES) {
    const value = missing[modality];
    if (typeof value === "string" && value.trim()) {
      result[modality] = value.trim().slice(0, 240);
    }
  }
  return result;
}

function minCoverageStart(
  coverage: CompanionPerceptionPacketReceipt["coverage"],
): number | null {
  let value: number | null = null;
  for (const modality of MODALITIES) {
    for (const interval of coverage[modality] ?? []) {
      value =
        value === null
          ? interval.startPts
          : Math.min(value, interval.startPts);
    }
  }
  return value;
}

function normalizeInterval(
  input: CompanionCoverageInterval,
): CompanionCoverageInterval | null {
  const start = finitePts(input.startPts);
  const end = finitePts(input.endPts);
  if (start === null || end === null) return null;
  return {
    startPts: Math.min(start, end),
    endPts: Math.max(start, end),
  };
}

function requirePts(value: number): number {
  const normalized = finitePts(value);
  if (normalized === null) {
    throw new Error("media PTS must be finite and non-negative");
  }
  return normalized;
}

function finitePts(value: number | null | undefined): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function emptyCoverage(): Record<
  CompanionCoverageModality,
  CompanionCoverageInterval[]
> {
  return {
    context: [],
    subtitle: [],
    audio: [],
    visual: [],
    metadata: [],
  };
}

function sessionKey(
  profile: string,
  session: CompanionMediaSessionIdentity,
): string {
  return [
    profile,
    session.sessionId,
    session.playerIdentity,
    session.mediaIdentity,
    String(session.epoch),
  ].join("\u0000");
}

function sameSession(
  a: CompanionMediaSessionIdentity,
  b: CompanionMediaSessionIdentity,
): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.playerIdentity === b.playerIdentity &&
    a.mediaIdentity === b.mediaIdentity &&
    a.epoch === b.epoch
  );
}

function cloneReceipt(
  receipt: CompanionPerceptionPacketReceipt,
): CompanionPerceptionPacketReceipt {
  return {
    ...receipt,
    session: { ...receipt.session },
    coverage: Object.fromEntries(
      Object.entries(receipt.coverage).map(([key, value]) => [
        key,
        value?.map((interval) => ({ ...interval })),
      ]),
    ),
    missing: { ...receipt.missing },
  };
}
