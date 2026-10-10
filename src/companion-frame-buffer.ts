import type { LiveFrameMediaMeta } from "./live-ws-hub.js";
import type { RouteScope } from "./route-identity.js";
import { routeScopeKey } from "./route-keys.js";

export interface CompanionFrameInput {
  buffer: Buffer;
  viewport: { width: number; height: number } | null;
  sequence: number;
  capturedAt: number;
  media?: LiveFrameMediaMeta | null;
}

export interface CompanionFrameSelection {
  buffer: Buffer;
  viewport: { width: number; height: number } | null;
  sequence: number;
  capturedAt: number;
  media: LiveFrameMediaMeta | null;
  storedAt: number;
  ageMs: number;
  requestedLookbackMs: number;
  offsetFromTargetMs: number;
}

export interface CompanionFrameBufferStatus {
  profile: string;
  frames: number;
  bytes: number;
  oldestAgeMs: number | null;
  newestAgeMs: number | null;
  windowMs: number;
  sampleIntervalMs: number;
  maxFrames: number;
  maxBytesPerProfile: number;
}

interface StoredFrame extends CompanionFrameInput {
  storedAt: number;
  bucket: number;
}

export class CompanionFrameBuffer {
  private readonly frames = new Map<string, StoredFrame[]>();
  readonly windowMs: number;
  readonly sampleIntervalMs: number;
  readonly maxFrames: number;
  readonly maxBytesPerProfile: number;

  constructor(options: {
    windowMs?: number;
    sampleIntervalMs?: number;
    maxFrames?: number;
    maxBytesPerProfile?: number;
  } = {}) {
    this.windowMs = clampInt(options.windowMs ?? 15_000, 2_000, 60_000);
    this.sampleIntervalMs = clampInt(
      options.sampleIntervalMs ?? 500,
      100,
      5_000,
    );
    this.maxFrames = clampInt(options.maxFrames ?? 36, 4, 240);
    this.maxBytesPerProfile = clampInt(
      options.maxBytesPerProfile ?? 12_000_000,
      1_000_000,
      128_000_000,
    );
  }

  push(route: RouteScope, input: CompanionFrameInput, now = Date.now()): void {
    this.pushKey(trustedKey(route), input, now);
  }

  /** Explicit private legacy compatibility path; it never accesses trusted route frames. */
  pushLegacy(profile: string, input: CompanionFrameInput, now = Date.now()): void {
    this.pushKey(legacyKey(profile), input, now);
  }

  private pushKey(key: string, input: CompanionFrameInput, now: number): void {
    const list = this.frames.get(key) ?? [];
    this.pruneList(list, now);

    const bucket = Math.floor(now / this.sampleIntervalMs);
    const frame: StoredFrame = {
      ...input,
      storedAt: now,
      bucket,
    };

    const last = list.at(-1);
    if (last && last.bucket === bucket) {
      list[list.length - 1] = frame;
    } else {
      list.push(frame);
    }

    this.trimBounds(list);
    if (list.length > 0) this.frames.set(key, list);
    else this.frames.delete(key);
  }

  select(route: RouteScope, lookbackSeconds = 0, now = Date.now()): CompanionFrameSelection | null {
    return this.selectKey(trustedKey(route), lookbackSeconds, now);
  }

  selectLegacy(profile: string, lookbackSeconds = 0, now = Date.now()): CompanionFrameSelection | null {
    return this.selectKey(legacyKey(profile), lookbackSeconds, now);
  }

  private selectKey(key: string, lookbackSeconds: number, now: number): CompanionFrameSelection | null {
    const list = this.frames.get(key);
    if (!list || list.length === 0) return null;
    this.pruneList(list, now);
    if (list.length === 0) {
      this.frames.delete(key);
      return null;
    }

    const requestedLookbackMs = clampInt(
      Math.round(lookbackSeconds * 1000),
      0,
      this.windowMs,
    );
    const target = now - requestedLookbackMs;
    let selected: StoredFrame | null = null;
    for (const frame of list) {
      if (frame.storedAt <= target) selected = frame;
      else break;
    }

    if (!selected) return null;
    return {
      buffer: selected.buffer,
      viewport: selected.viewport,
      sequence: selected.sequence,
      capturedAt: selected.capturedAt,
      media: selected.media ?? null,
      storedAt: selected.storedAt,
      ageMs: Math.max(0, now - selected.storedAt),
      requestedLookbackMs,
      offsetFromTargetMs: Math.max(0, target - selected.storedAt),
    };
  }

  status(route: RouteScope, now = Date.now()): CompanionFrameBufferStatus {
    return this.statusKey(trustedKey(route), "trusted", now);
  }

  statusLegacy(profile: string, now = Date.now()): CompanionFrameBufferStatus {
    return this.statusKey(legacyKey(profile), profile, now);
  }

  private statusKey(key: string, profile: string, now: number): CompanionFrameBufferStatus {
    const list = this.frames.get(key) ?? [];
    this.pruneList(list, now);
    if (list.length === 0) this.frames.delete(key);
    const bytes = list.reduce((sum, frame) => sum + frame.buffer.length, 0);
    return {
      profile,
      frames: list.length,
      bytes,
      oldestAgeMs:
        list.length > 0 ? Math.max(0, now - list[0]!.storedAt) : null,
      newestAgeMs:
        list.length > 0
          ? Math.max(0, now - list[list.length - 1]!.storedAt)
          : null,
      windowMs: this.windowMs,
      sampleIntervalMs: this.sampleIntervalMs,
      maxFrames: this.maxFrames,
      maxBytesPerProfile: this.maxBytesPerProfile,
    };
  }

  clear(route: RouteScope): void { this.frames.delete(trustedKey(route)); }

  clearLegacy(profile: string): void { this.frames.delete(legacyKey(profile)); }

  aggregate(now = Date.now()): { routes: number; frames: number; bytes: number } {
    let routes = 0;
    let frames = 0;
    let bytes = 0;
    for (const [key, list] of this.frames) {
      this.pruneList(list, now);
      if (list.length === 0) { this.frames.delete(key); continue; }
      routes++;
      frames += list.length;
      bytes += list.reduce((sum, frame) => sum + frame.buffer.length, 0);
    }
    return { routes, frames, bytes };
  }

  private pruneList(list: StoredFrame[], now: number): void {
    const cutoff = now - this.windowMs;
    while (list.length > 0 && list[0]!.storedAt < cutoff) list.shift();
  }

  private trimBounds(list: StoredFrame[]): void {
    let bytes = list.reduce((sum, frame) => sum + frame.buffer.length, 0);
    while (
      list.length > this.maxFrames ||
      (list.length > 1 && bytes > this.maxBytesPerProfile)
    ) {
      const removed = list.shift();
      if (removed) bytes -= removed.buffer.length;
    }
  }
}

function trustedKey(route: RouteScope): string {
  if (!route || typeof route !== "object" || !route.humanUserId || !route.deviceId || !route.sessionId || !route.profileId) {
    throw new Error("RouteScope required for trusted companion buffer");
  }
  return "trusted:" + routeScopeKey(route);
}

function legacyKey(profile: string): string {
  if (typeof profile !== "string" || !profile) throw new Error("Legacy profile required");
  return "legacy:" + profile;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
