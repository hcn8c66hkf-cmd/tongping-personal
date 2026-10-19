import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";

const PROFILE_RE = /^[A-Za-z0-9._-]{1,80}$/;
const SEGMENT_RE = /^(?:init\.mp4|seg_\d{6}\.(?:m4s|ts)|init_[A-Za-z0-9_-]{1,80}\.mp4|seg_[A-Za-z0-9_-]{1,80}_\d{1,20}\.(?:m4s|ts))$/;
const DEFAULT_ROOT = path.join((process.env.TONGPING_HOME?.trim() || path.join(os.homedir(), ".tongping")), "companion-hls");

export interface DelayedCompanionFrame {
  buffer: Buffer;
  viewport: null;
  sequence: number;
  capturedAt: number;
  media: null;
  storedAt: number;
  ageMs: number;
  requestedLookbackMs: number;
  offsetFromTargetMs: number;
  source: "companion-hls";
  playbackTime: number;
  presentationDateMs: number | null;
}

export interface DelayedCompanionPlaybackPoint {
  currentTime: number | null;
  presentationDateMs: number | null;
  receivedAt: number;
}

export interface CompanionSourceTimelineAnchor {
  sourcePts: number;
  sourceDuration: number | null;
  wallClockMs: number;
  playbackRate: number;
  mediaKey?: string;
}

// A Worker media-clock reply (human_media_clock / browser_media_context) as a
// source timeline anchor; shared by the personal daemon and the hosted relay.
export function sourceTimelineFromResult(
  result: unknown,
  wallClockMs = Date.now(),
): CompanionSourceTimelineAnchor | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const media = (result as Record<string, unknown>).media;
  if (!media || typeof media !== "object" || Array.isArray(media)) {
    return null;
  }
  const row = media as Record<string, unknown>;
  const currentTime =
    typeof row.currentTime === "number" && Number.isFinite(row.currentTime)
      ? Math.max(0, row.currentTime)
      : null;
  if (currentTime === null) return null;
  const duration =
    typeof row.duration === "number" &&
    Number.isFinite(row.duration) &&
    row.duration >= 0
      ? row.duration
      : null;
  const playbackRate =
    row.paused === true
      ? 0
      : typeof row.playbackRate === "number" &&
          Number.isFinite(row.playbackRate) &&
          row.playbackRate > 0
        ? row.playbackRate
        : 1;
  const url = (result as Record<string, unknown>).url;
  return {
    sourcePts: currentTime,
    sourceDuration: duration,
    wallClockMs,
    playbackRate,
    ...(typeof url === "string" ? { mediaKey: url.slice(0, 300) } : {}),
  };
}

const MAX_SOURCE_SAMPLES = 200;

// Chrome tab capture hands the recorder its audio a little after the
// matching picture, so the sound lands slightly late. Hold the picture back
// by this much (ms, tunable per deployment) to line them up again.
const COMPANION_AV_VIDEO_DELAY_S = (() => {
  const raw = Number(process.env.TONGPING_COMPANION_AV_VIDEO_DELAY_MS ?? "150");
  return Number.isFinite(raw) ? Math.max(-1000, Math.min(1000, raw)) / 1000 : 0.15;
})();

export const COMPANION_VIDEO_FILTER =
  "setpts='if(eq(N,0)," + COMPANION_AV_VIDEO_DELAY_S.toFixed(3) +
  "/TB,PREV_OUTPTS+clip(PTS-PREV_INPTS,1,0.25/TB))'," +
  "scale=w=1280:h=-2:force_original_aspect_ratio=decrease," +
  "pad=ceil(iw/2)*2:ceil(ih/2)*2";

export const COMPANION_AUDIO_FILTER = "asetpts=N/SR/TB";

// The same timestamp rule as COMPANION_VIDEO_FILTER, as a bitstream filter so
// H.264 from the recorder can be copied instead of re-encoded (about 1/8 of
// the CPU per viewer). Commas are escaped for the -bsf list parser.
export const COMPANION_COPY_VIDEO_BSF =
  "setts=ts=if(eq(N\\,0)\\," + COMPANION_AV_VIDEO_DELAY_S.toFixed(3) +
  "/TB\\,PREV_OUTPTS+clip(PTS-PREV_INPTS\\,1\\,0.25/TB))";

// Copying H.264 from Chrome saves CPU, but some Windows MediaRecorder builds
// stop emitting usable keyframes after the first cluster. ffmpeg then keeps
// accepting megabytes while the HLS playlist stays at zero seconds forever.
// Personal installs therefore re-encode by default for deterministic 2 s GOPs.
// The old low-CPU path remains an explicit opt-in for proven-good machines.
export function isCopyableCompanionMime(mimeType: string): boolean {
  if (process.env.TONGPING_COMPANION_VIDEO_COPY_WEBM !== "1") return false;
  return /^video\/(?:webm|x-matroska);.*\b(?:h264|avc1)/i.test(mimeType);
}

// ffmpeg 4.x splits -bsf on every comma, escaped or not, so the setts rule
// above only parses on 5.0+. Older ffmpeg keeps re-encoding.
let ffmpegMajorProbe: Promise<number> | null = null;
export function ffmpegMajorVersion(): Promise<number> {
  ffmpegMajorProbe ??= new Promise<number>((resolve) => {
    let out = "";
    try {
      const probe = spawn("ffmpeg", ["-hide_banner", "-version"], { stdio: ["ignore", "pipe", "ignore"] });
      probe.stdout.setEncoding("utf8");
      probe.stdout.on("data", (chunk: string) => { out += chunk; });
      probe.on("error", () => resolve(0));
      probe.on("close", () => {
        // Git/snapshot builds ("N-12345-g...", "2025-01-02-git-...") are
        // newer than any release that lacks escaped -bsf commas.
        if (/ffmpeg version (?:N-|\d{4}-\d{2}-\d{2}-git)/.test(out)) return resolve(99);
        const match = /ffmpeg version n?(\d+)\./.exec(out);
        resolve(match ? Number(match[1]) : 0);
      });
    } catch {
      resolve(0);
    }
  });
  const pending = ffmpegMajorProbe;
  // A failed probe (spawn hiccup on a busy box) must not pin re-encoding
  // until restart; probe again next session.
  void pending.then((major) => { if (major === 0 && ffmpegMajorProbe === pending) ffmpegMajorProbe = null; });
  return pending;
}

export function companionVideoArgs(copy: boolean): string[] {
  if (copy) {
    return ["-c:v", "copy", "-bsf:v", COMPANION_COPY_VIDEO_BSF];
  }
  return [
    "-vf", COMPANION_VIDEO_FILTER,
    "-r", "20",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", "40",
    "-keyint_min", "40",
    "-sc_threshold", "0",
    "-b:v", "1600k",
    "-maxrate", "2200k",
    "-bufsize", "3200k",
  ];
}

// FFmpeg's fragmented-MP4 HLS muxer can keep accepting and encoding a live
// WebM pipe on Windows without ever publishing its init file or playlist.
// MPEG-TS HLS has no separate init fragment and is also supported by both
// Safari's native HLS player and hls.js, so use it for personal Windows
// installs. Keep fMP4 elsewhere to avoid changing proven deployments.
export function companionUsesMpegTs(
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (process.env.TONGPING_COMPANION_HLS_FMP4 === "1") return false;
  return process.env.TONGPING_COMPANION_HLS_MPEGTS === "1" ||
    platform === "win32";
}

// Source time at a capture wall-clock date, from the newest sample taken at
// or before it. Samples are re-taken every few seconds, so a looping clip or
// a switched video is corrected instead of extrapolated forever.
export function sourceSampleAt(
  samples: readonly CompanionSourceTimelineAnchor[],
  dateMs: number,
): CompanionSourceTimelineAnchor | null {
  let pick: CompanionSourceTimelineAnchor | null = samples[0] ?? null;
  for (const sample of samples) {
    if (sample.wallClockMs > dateMs) break;
    pick = sample;
  }
  return pick;
}

// When each segment file was finished, on the server's wall clock.
// PROGRAM-DATE-TIME is ffmpeg's start time plus media duration, so it falls
// behind the wall clock whenever capture stalls; wall-clock questions (when
// did the viewer enter, what was the source doing then) must use this.
async function segmentWallEnds(
  dir: string,
  segments: ReadonlyArray<{ uri: string }>,
): Promise<Array<number | null>> {
  return Promise.all(
    segments.map((segment) =>
      stat(path.join(dir, path.basename(segment.uri))).then(
        (info) => info.mtimeMs,
        () => null,
      ),
    ),
  );
}

export function companionEntryCutoff(
  sessionStartedAt: number | null,
  entryAtMs: number | null,
): number | null {
  return entryAtMs !== null && sessionStartedAt !== null &&
    Math.abs(entryAtMs - sessionStartedAt) <= 5_000
      ? null
      : entryAtMs;
}

export function sourcePtsAt(
  sample: CompanionSourceTimelineAnchor,
  dateMs: number,
): number {
  let pts =
    sample.sourcePts +
    ((dateMs - sample.wallClockMs) / 1000) * sample.playbackRate;
  if (sample.sourceDuration !== null && sample.sourceDuration > 0) {
    pts = Math.min(pts, sample.sourceDuration);
  }
  return Math.max(0, pts);
}


interface Session {
  profile: string;
  streamId: string;
  mimeType: string;
  videoCopy: boolean;
  dir: string;
  process: ChildProcessWithoutNullStreams;
  startedAt: number;
  bytesIn: number;
  chunksIn: number;
  lastChunkAt: number;
  stderrTail: string;
  exited: boolean;
  exitCode: number | null;
  sourceTimeline: CompanionSourceTimelineAnchor | null;
  sourceSamples: CompanionSourceTimelineAnchor[];
  encodedSeconds: number;
  encodedFrames: number;
  lastEncodedAt: number;
  // While the viewer has companion paused the recorder is paused too; no
  // source samples are taken then (the source is held still).
  pausedSince: number | null;
  // A recorder restarted mid-watch (uplink hiccup, watchdog): the viewer
  // already waited out the delay once, so it resumes on a short buffer.
  quickResume: boolean;
}

// Within this long of the previous recorder ending, a new one is a restart.
const QUICK_RESUME_WINDOW_MS = 60_000;
const QUICK_RESUME_SECONDS = 6;

export class DelayedCompanionHls {
  private readonly sessions = new Map<string, Session>();
  private readonly lastEndedAt = new Map<string, number>();
  private readonly recentExits: Array<{
    profile: string;
    streamId: string;
    startedAt: string;
    exitedAt: string;
    ageMs: number;
    bytesIn: number;
    chunksIn: number;
    exitCode: number | null;
    stderrTail: string;
  }> = [];

  constructor(private readonly rootDir = DEFAULT_ROOT) {}

  async start(
    profile: string,
    streamId: string,
    mimeType: string,
    sourceTimeline: CompanionSourceTimelineAnchor | null = null,
    isCurrent?: () => Promise<boolean>,
  ): Promise<void> {
    assertProfile(profile);
    if (isCurrent && !(await isCurrent())) return;
    await this.stop(profile);
    if (isCurrent && !(await isCurrent())) return;

    const dir = path.join(this.rootDir, profile);
    await mkdir(dir, { recursive: true });
    if (isCurrent && !(await isCurrent())) return;
    const playlist = path.join(dir, "index.m3u8");

    // Keep the previous generation's media files briefly so a native HLS
    // player can finish in-flight requests while the stable playlist URL
    // advances to the next generation.
    try { await unlink(playlist); } catch {}
    if (isCurrent && !(await isCurrent())) return;
    const cutoff = Date.now() - 5 * 60_000;
    try {
      for (const name of await readdir(dir)) {
        if (isCurrent && !(await isCurrent())) return;
        if (!SEGMENT_RE.test(name)) continue;
        const file = path.join(dir, name);
        try {
          const info = await stat(file);
          if (isCurrent && !(await isCurrent())) return;
          if (info.mtimeMs < cutoff) await unlink(file);
        } catch {}
      }
    } catch {}

    if (isCurrent && !(await isCurrent())) return;

    const generationToken = streamId
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 80);
    const mediaSequenceBase = Math.max(
      1,
      Math.floor(Date.now() / 1000),
    );
    const initName = "init_" + generationToken + ".mp4";
    const useMpegTs = companionUsesMpegTs();
    const segmentPattern = path.join(
      dir,
      "seg_" + generationToken + "_%010d." + (useMpegTs ? "ts" : "m4s"),
    );

    const copyVideo =
      isCopyableCompanionMime(mimeType) && (await ffmpegMajorVersion()) >= 5;
    if (isCurrent && !(await isCurrent())) return;

    const args = [
      "-hide_banner",
      "-loglevel", "warning",
      "-fflags", "+genpts+discardcorrupt",
      "-i", "pipe:0",
      "-map", "0:v:0",
      "-map", "0:a:0?",
      // Tab capture delivers a variable frame rate (often ~15fps), so video
      // time must follow the recorder's own frame spacing, not a frame count:
      // N/(20*TB) ran video at ~0.75x real time and let audio drift ahead.
      // MediaRecorder may also jump its PTS after a tab stalls; each
      // frame step is clamped to 250ms so a jump cannot become minutes of
      // duplicated frames. Audio stays sample-count based (continuous).
      // Chrome tab capture sometimes gives audio and video unrelated large
      // starting PTS values. Keeping those origins can make the HLS muxer
      // wait forever even while hundreds of frames encode. Normalize both
      // clocks to zero and apply the measured picture hold explicitly.
      // H.264 recordings keep their frames (copy); segments then cut on the
      // recorder's 2 s key frames.
      ...companionVideoArgs(copyVideo),
      "-af", COMPANION_AUDIO_FILTER,
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-ar", "48000",
      "-progress", "pipe:1",
      "-nostats",
      "-f", "hls",
      "-hls_time", "2",
      "-hls_list_size", "75",
      "-hls_delete_threshold", "5",
      "-hls_flags", "delete_segments+append_list+independent_segments+omit_endlist+program_date_time",
      "-hls_segment_type", useMpegTs ? "mpegts" : "fmp4",
      "-start_number", String(mediaSequenceBase),
      ...(useMpegTs ? [] : ["-hls_fmp4_init_filename", initName]),
      "-hls_segment_filename", segmentPattern,
      playlist,
    ];

    // Run inside the session directory: the fMP4 init file is named
    // relative, and newer ffmpeg resolves it against cwd, not the segments.
    const child = spawn("ffmpeg", args, {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const session: Session = {
      profile,
      streamId,
      mimeType,
      videoCopy: copyVideo,
      dir,
      process: child,
      startedAt: Date.now(),
      bytesIn: 0,
      chunksIn: 0,
      lastChunkAt: 0,
      stderrTail: "",
      exited: false,
      exitCode: null,
      sourceTimeline,
      sourceSamples: sourceTimeline ? [sourceTimeline] : [],
      encodedSeconds: 0,
      encodedFrames: 0,
      lastEncodedAt: 0,
      pausedSince: null,
      quickResume: Date.now() - (this.lastEndedAt.get(profile) ?? 0) < QUICK_RESUME_WINDOW_MS,
    };
    this.sessions.set(profile, session);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      session.stderrTail = (session.stderrTail + chunk).slice(-8000);
    });
    // Input traffic is not proof of a usable stream: malformed streaming
    // WebM can keep the pipe busy while producing no HLS output at all.
    child.stdout.setEncoding("utf8");
    let progressTail = "";
    child.stdout.on("data", (chunk: string) => {
      progressTail += chunk;
      const lines = progressTail.split(/\r?\n/);
      progressTail = lines.pop() ?? "";
      for (const line of lines) {
        const frameMatch = /^frame=(\d+)$/.exec(line);
        if (frameMatch) {
          session.encodedFrames = Math.max(
            session.encodedFrames,
            Number(frameMatch[1]) || 0,
          );
          continue;
        }
        const match = /^out_time_us=(\d+)$/.exec(line);
        if (!match) continue;
        const seconds = Number(match[1]) / 1_000_000;
        if (!Number.isFinite(seconds) || seconds <= session.encodedSeconds) continue;
        session.encodedSeconds = seconds;
        session.lastEncodedAt = Date.now();
      }
    });
    child.on("exit", (code) => {
      session.exited = true;
      session.exitCode = code;
      this.recentExits.unshift({
        profile: session.profile,
        streamId: session.streamId,
        startedAt: new Date(session.startedAt).toISOString(),
        exitedAt: new Date().toISOString(),
        ageMs: Math.max(0, Date.now() - session.startedAt),
        bytesIn: session.bytesIn,
        chunksIn: session.chunksIn,
        exitCode: code,
        stderrTail: session.stderrTail.slice(-4000),
      });
      if (this.recentExits.length > 12) {
        this.recentExits.length = 12;
      }
    });
    child.on("error", (error) => {
      session.stderrTail =
        (session.stderrTail + "\nspawn: " + error.message).slice(-8000);
    });
  }

  write(profile: string, streamId: string, payload: Buffer): boolean {
    const session = this.sessions.get(profile);
    if (
      !session ||
      session.streamId !== streamId ||
      session.exited ||
      !session.process.stdin.writable
    ) {
      return false;
    }
    session.bytesIn += payload.length;
    session.chunksIn += 1;
    session.lastChunkAt = Date.now();
    return session.process.stdin.write(payload);
  }

  async stop(profile: string, streamId?: string): Promise<void> {
    const session = this.sessions.get(profile);
    if (!session) return;
    if (streamId && session.streamId !== streamId) return;
    this.sessions.delete(profile);
    this.lastEndedAt.set(profile, Date.now());

    try { session.process.stdin.end(); } catch {}
    const child = session.process;
    setTimeout(() => {
      if (!session.exited) {
        try { child.kill("SIGTERM"); } catch {}
      }
    }, 1500).unref?.();
    setTimeout(() => {
      if (!session.exited) {
        try { child.kill("SIGKILL"); } catch {}
      }
    }, 3500).unref?.();
  }

  // Drop a finished watch session's recording once its ffmpeg is gone, so
  // old media does not linger on disk (or look like the current watch).
  async purge(profile: string): Promise<void> {
    assertProfile(profile);
    if (this.sessions.has(profile)) return;
    await rm(path.join(this.rootDir, profile), { recursive: true, force: true })
      .catch(() => {});
  }

  async purgeAll(): Promise<void> {
    let names: string[] = [];
    try { names = await readdir(this.rootDir); } catch { return; }
    await Promise.all(
      names
        .filter((name) => /^[A-Za-z0-9._-]{1,64}$/.test(name) && !this.sessions.has(name))
        .map((name) =>
          rm(path.join(this.rootDir, name), { recursive: true, force: true }).catch(() => {}),
        ),
    );
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.sessions.keys()].map((profile) => this.stop(profile)),
    );
  }

  noteSourceTimeline(
    profile: string,
    sample: CompanionSourceTimelineAnchor,
  ): void {
    const session = this.sessions.get(profile);
    if (!session || session.exited || session.pausedSince !== null) return;
    const last = session.sourceSamples[session.sourceSamples.length - 1];
    if (last && sample.wallClockMs <= last.wallClockMs) return;
    session.sourceSamples.push(sample);
    if (session.sourceSamples.length > MAX_SOURCE_SAMPLES) {
      session.sourceSamples.splice(
        0,
        session.sourceSamples.length - MAX_SOURCE_SAMPLES,
      );
    }
  }

  setPaused(profile: string, paused: boolean): void {
    const session = this.sessions.get(profile);
    if (!session || session.exited) return;
    if (paused && session.pausedSince === null) {
      session.pausedSince = Date.now();
    } else if (!paused && session.pausedSince !== null) {
      session.pausedSince = null;
    }
  }

  isPaused(profile: string): boolean {
    const session = this.sessions.get(profile);
    return Boolean(session && !session.exited && session.pausedSince !== null);
  }

  async bufferedSeconds(
    profile: string,
    minDateMs: number | null = null,
  ): Promise<number> {
    assertProfile(profile);
    const activeSession = this.sessions.get(profile);
    if (activeSession?.exited) return 0;
    // A fresh companion entry normally starts this exact recorder generation.
    // Its playlist cannot contain media from the previous watch because start()
    // unlinks index.m3u8 and uses generation-unique segment names. On Windows,
    // filesystem timestamp granularity/order can otherwise make every new
    // segment look older than the near-simultaneous card entry and pin the UI
    // at 0 seconds forever. Keep the cutoff only for a genuinely later viewer
    // that attaches to an already-running generation.
    const effectiveMinDateMs = companionEntryCutoff(
      activeSession?.startedAt ?? null,
      minDateMs,
    );
    const playlistPath = path.join(this.rootDir, profile, "index.m3u8");
    let text: string;
    try {
      text = await readFile(playlistPath, "utf8");
    } catch {
      return 0;
    }

    const entries: Array<{ uri: string; duration: number }> = [];
    let duration = 0;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("#EXTINF:")) {
        const raw = Number(line.slice(8).split(",")[0]);
        duration = Number.isFinite(raw) && raw > 0 ? raw : 0;
        continue;
      }
      if (!line || line.startsWith("#")) continue;
      entries.push({ uri: line.trim(), duration });
      duration = 0;
    }
    const dir = path.join(this.rootDir, profile);
    const wallEnds = effectiveMinDateMs === null
      ? entries.map(() => null)
      : await segmentWallEnds(dir, entries);
    let total = 0;
    entries.forEach((entry, index) => {
      // Media written before this companion entry (e.g. before the viewer
      // went back to LIVE) is not part of this watch session's buffer.
      const wallEnd = wallEnds[index] ?? null;
      if (
        effectiveMinDateMs === null ||
        wallEnd === null ||
        wallEnd > effectiveMinDateMs
      ) {
        total += entry.duration;
      }
    });
    return Math.max(0, total);
  }

  async playlist(
    profile: string,
    delaySeconds: number,
    signedQuery: string,
    minDateMs: number | null = null,
  ): Promise<string | null> {
    assertProfile(profile);
    const activeSession = this.sessions.get(profile);
    if (activeSession?.exited) return null;
    const effectiveMinDateMs = companionEntryCutoff(
      activeSession?.startedAt ?? null,
      minDateMs,
    );
    const dir = path.join(this.rootDir, profile);
    const playlistPath = path.join(dir, "index.m3u8");
    let text: string;
    try {
      text = await readFile(playlistPath, "utf8");
    } catch {
      return null;
    }

    const delay = Math.max(8, Math.min(90, Math.round(delaySeconds)));
    const lines = text.split(/\r?\n/);
    const segments: Array<{
      prelude: string[];
      uri: string;
      duration: number;
      programDateTimeMs: number | null;
    }> = [];
    const header: string[] = [];
    let pending: string[] = [];
    let duration = 2;
    let programDateTimeMs: number | null = null;

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("#EXTINF:")) {
        const raw = Number(line.slice(8).split(",")[0]);
        duration = Number.isFinite(raw) && raw > 0 ? raw : 2;
        pending.push(line);
        continue;
      }
      if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
        const parsed = Date.parse(
          line.slice("#EXT-X-PROGRAM-DATE-TIME:".length),
        );
        programDateTimeMs = Number.isFinite(parsed) ? parsed : null;
        pending.push(line);
        continue;
      }
      if (!line.startsWith("#")) {
        segments.push({
          prelude: pending,
          uri: line.trim(),
          duration,
          programDateTimeMs,
        });
        pending = [];
        duration = 2;
        programDateTimeMs = null;
        continue;
      }
      if (segments.length === 0 && pending.length === 0) {
        header.push(line);
      } else {
        pending.push(line);
      }
    }

    const wallEnds = await segmentWallEnds(dir, segments);
    let dropped = 0;
    if (effectiveMinDateMs !== null) {
      while (dropped < segments.length) {
        const segment = segments[dropped]!;
        const wallEnd = wallEnds[dropped] ?? null;
        if (wallEnd === null || wallEnd > effectiveMinDateMs) break;
        // Keep the newest init map a dropped segment introduced, so the
        // first kept segment still decodes with its own generation's init.
        const map = segment.prelude.find((line) =>
          line.startsWith("#EXT-X-MAP:"),
        );
        if (map) {
          const index = header.findIndex((line) =>
            line.startsWith("#EXT-X-MAP:"),
          );
          if (index >= 0) header[index] = map;
          else header.push(map);
        }
        dropped += 1;
      }
      if (dropped > 0) {
        segments.splice(0, dropped);
        wallEnds.splice(0, dropped);
        const index = header.findIndex((line) =>
          line.startsWith("#EXT-X-MEDIA-SEQUENCE:"),
        );
        if (index >= 0) {
          const sequence = Number(
            header[index]!.slice("#EXT-X-MEDIA-SEQUENCE:".length),
          );
          if (Number.isFinite(sequence)) {
            header[index] = "#EXT-X-MEDIA-SEQUENCE:" + String(sequence + dropped);
          }
        }
      }
    }

    const quickResume = activeSession?.quickResume === true;
    if (segments.length < (quickResume ? 3 : 4)) return null;

    // The viewer's delay used to be hidden here (the newest `delay` seconds
    // were withheld), which left the phone only a segment or two of its own
    // buffer: any hiccup on the phone's link stalled playback and the
    // recovery reload jumped to the live edge. Now the whole window is
    // published and EXT-X-START asks the player to begin `delay` seconds
    // behind the edge, so the phone itself holds the delay as buffer.
    const totalDuration = segments.reduce(
      (sum, segment) => sum + segment.duration,
      0,
    );
    if (totalDuration < (quickResume ? QUICK_RESUME_SECONDS : delay + 4)) return null;
    const visible = segments;

    const query = signedQuery ? "?" + signedQuery : "";
    const rewriteInitMap = (line: string): string =>
      line.replace(/URI="([^"]+)"/, (match, sourceName: string) => {
        const name = path.basename(sourceName);
        if (!/^init(?:_[A-Za-z0-9_-]{1,80})?\.mp4$/.test(name)) return match;
        return 'URI="/v1/app/companion-file' + query +
          '&name=' + encodeURIComponent(name) + '"';
      });
    const out: string[] = [];
    for (const line of header) {
      out.push(line.startsWith("#EXT-X-MAP:") ? rewriteInitMap(line) : line);
    }
    out.push("#EXT-X-START:TIME-OFFSET=-" + String(delay) + ",PRECISE=YES");

    const session = this.sessions.get(profile);
    if (session?.streamId) {
      out.push("#TONGPING-STREAM-ID:" + session.streamId);
    }
    // Samples are on the wall clock; move each onto the PROGRAM-DATE-TIME
    // clock via the segment being written when it was taken (that segment's
    // wall-vs-PDT offset covers capture latency, stalls and pauses).
    const references = segments
      .map((segment, index) => ({ segment, wallEnd: wallEnds[index] ?? null }))
      .filter((row) =>
        row.segment.programDateTimeMs !== null && row.wallEnd !== null,
      );
    const toProgramDate = (wallMs: number): number => {
      let reference = references[0];
      for (const row of references) {
        reference = row;
        if (row.wallEnd! >= wallMs) break;
      }
      if (!reference) return wallMs;
      const offset =
        reference.wallEnd! -
        (reference.segment.programDateTimeMs! +
          reference.segment.duration * 1000);
      return wallMs - offset;
    };
    const samples = (session?.sourceSamples ?? [])
      .map((sample) => ({
        ...sample,
        wallClockMs: toProgramDate(sample.wallClockMs),
      }))
      .sort((a, b) => a.wallClockMs - b.wallClockMs);
    const firstDate =
      visible.find((segment) => segment.programDateTimeMs !== null)
        ?.programDateTimeMs ?? null;
    const last = visible[visible.length - 1] ?? null;
    const lastEnd =
      last && last.programDateTimeMs !== null
        ? last.programDateTimeMs + last.duration * 1000
        : null;
    const legacyAnchor =
      firstDate !== null ? sourceSampleAt(samples, firstDate) : null;
    const endSample =
      lastEnd !== null ? sourceSampleAt(samples, lastEnd) : null;
    if (legacyAnchor) {
      // Single-anchor tags stay for v77 cards; v78+ reads the samples below.
      out.push(
        "#TONGPING-SOURCE-ANCHOR-PTS:" +
          legacyAnchor.sourcePts.toFixed(3),
      );
      out.push(
        "#TONGPING-SOURCE-ANCHOR-DATE-MS:" +
          String(Math.round(legacyAnchor.wallClockMs)),
      );
      out.push(
        "#TONGPING-SOURCE-PLAYBACK-RATE:" +
          Math.max(legacyAnchor.playbackRate, 0.000001).toFixed(6),
      );
      const duration =
        endSample?.sourceDuration ?? legacyAnchor.sourceDuration;
      if (duration !== null) {
        out.push("#TONGPING-SOURCE-DURATION:" + duration.toFixed(3));
      }
    }
    if (firstDate !== null && lastEnd !== null && endSample) {
      // The buffered range only spans the video now at the buffer end: walk
      // back while it is the same media and its clock ran forward (a loop
      // or a switch starts a new range).
      let rangeStartDate = firstDate;
      const endIndex = samples.indexOf(endSample);
      for (let index = endIndex; index > 0; index -= 1) {
        const current = samples[index]!;
        const previous = samples[index - 1]!;
        const sameMedia =
          (previous.mediaKey ?? "") === (current.mediaKey ?? "") &&
          previous.sourcePts <= current.sourcePts + 0.5;
        if (!sameMedia) {
          rangeStartDate = Math.max(rangeStartDate, current.wallClockMs);
          break;
        }
      }
      const startSample = sourceSampleAt(samples, rangeStartDate);
      if (startSample) {
        out.push(
          "#TONGPING-BUFFER-START-PTS:" +
            sourcePtsAt(startSample, rangeStartDate).toFixed(3),
        );
      }
      out.push(
        "#TONGPING-BUFFER-END-PTS:" +
          sourcePtsAt(endSample, lastEnd).toFixed(3),
      );
    }
    if (firstDate !== null && lastEnd !== null) {
      const startIndex = samples.indexOf(
        sourceSampleAt(samples, firstDate)!,
      );
      for (const sample of samples.slice(Math.max(0, startIndex))) {
        if (sample.wallClockMs > lastEnd) break;
        out.push(
          "#TONGPING-SOURCE-SAMPLE:" +
            String(Math.round(sample.wallClockMs)) + "," +
            sample.sourcePts.toFixed(3) + "," +
            sample.playbackRate.toFixed(6) + "," +
            (sample.sourceDuration !== null
              ? sample.sourceDuration.toFixed(3)
              : "-"),
        );
      }
    }

    if (visible.length > 0) {
      out.push("#EXT-X-DISCONTINUITY");
    }

    for (const segment of visible) {
      for (const line of segment.prelude) {
        out.push(line.startsWith("#EXT-X-MAP:") ? rewriteInitMap(line) : line);
      }
      const name = path.basename(segment.uri);
      if (!SEGMENT_RE.test(name)) continue;
      out.push("/v1/app/companion-file" + query + "&name=" + encodeURIComponent(name));
    }

    return out.join("\n") + "\n";
  }

  async frameAtPlayback(
    profile: string,
    playback: DelayedCompanionPlaybackPoint,
    lookbackSeconds = 0,
  ): Promise<DelayedCompanionFrame | null> {
    assertProfile(profile);
    if (
      !playback ||
      !Number.isFinite(playback.currentTime) ||
      (playback.currentTime ?? -1) < 0
    ) {
      return null;
    }

    const dir = path.join(this.rootDir, profile);
    const playlistPath = path.join(dir, "index.m3u8");
    let text: string;
    try {
      text = await readFile(playlistPath, "utf8");
    } catch {
      return null;
    }

    const segments: Array<{
      duration: number;
      programDateTimeMs: number | null;
      uri: string;
    }> = [];
    let duration = 2;
    let programDateTimeMs: number | null = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#EXTINF:")) {
        const parsed = Number(line.slice(8).split(",")[0]);
        duration = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
        continue;
      }
      if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
        const parsed = Date.parse(line.slice("#EXT-X-PROGRAM-DATE-TIME:".length));
        programDateTimeMs = Number.isFinite(parsed) ? parsed : null;
        continue;
      }
      if (!line.startsWith("#")) {
        segments.push({
          duration,
          programDateTimeMs,
          uri: line,
        });
        if (programDateTimeMs !== null) {
          programDateTimeMs += duration * 1000;
        }
        duration = 2;
      }
    }
    if (segments.length === 0) return null;

    const totalSeconds = segments.reduce(
      (sum, segment) => sum + segment.duration,
      0,
    );
    const lookback = Math.max(0, Math.min(15, Number(lookbackSeconds) || 0));
    let targetSeconds = Math.max(
      0,
      Math.min(
        Math.max(0, totalSeconds - 0.05),
        (playback.currentTime ?? 0) - lookback,
      ),
    );
    let targetDateMs =
      playback.presentationDateMs !== null &&
      Number.isFinite(playback.presentationDateMs)
        ? playback.presentationDateMs - lookback * 1000
        : null;

    if (targetDateMs !== null) {
      let elapsed = 0;
      let matched = false;
      for (const segment of segments) {
        if (segment.programDateTimeMs !== null) {
          const endMs =
            segment.programDateTimeMs + segment.duration * 1000;
          if (
            targetDateMs >= segment.programDateTimeMs &&
            targetDateMs < endMs
          ) {
            targetSeconds =
              elapsed +
              (targetDateMs - segment.programDateTimeMs) / 1000;
            matched = true;
            break;
          }
        }
        elapsed += segment.duration;
      }
      if (!matched) targetDateMs = null;
    }

    const snapshotName =
      ".companion-frame-" +
      process.pid +
      "-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 8) +
      ".m3u8";
    const snapshotPath = path.join(dir, snapshotName);
    const staticPlaylist =
      text.replace(/\s*#EXT-X-ENDLIST\s*$/m, "").trimEnd() +
      "\n#EXT-X-ENDLIST\n";

    try {
      await writeFile(snapshotPath, staticPlaylist, "utf8");
      const buffer = await extractJpegFrame(snapshotPath, targetSeconds);
      if (!buffer || buffer.length <= 0) return null;

      let sequence = 0;
      let elapsed = 0;
      for (let index = 0; index < segments.length; index += 1) {
        const next = elapsed + segments[index]!.duration;
        if (targetSeconds < next) {
          sequence = index;
          break;
        }
        elapsed = next;
        sequence = index;
      }

      const firstDate = segments.find(
        (segment) => segment.programDateTimeMs !== null,
      )?.programDateTimeMs ?? null;
      const capturedAt =
        targetDateMs ??
        (firstDate !== null
          ? Math.round(firstDate + targetSeconds * 1000)
          : Date.now() - Math.round(lookback * 1000));
      const storedAt = Date.now();

      return {
        buffer,
        viewport: null,
        sequence,
        capturedAt,
        media: null,
        storedAt,
        ageMs: Math.max(0, storedAt - capturedAt),
        requestedLookbackMs: Math.round(lookback * 1000),
        offsetFromTargetMs: 0,
        source: "companion-hls",
        playbackTime: targetSeconds,
        presentationDateMs: targetDateMs,
      };
    } finally {
      await unlink(snapshotPath).catch(() => {});
    }
  }

  async audioPcmAtPlayback(
    profile: string,
    playback: DelayedCompanionPlaybackPoint,
    seconds = 5,
  ): Promise<{
    buffer: Buffer;
    sampleRate: number;
    channels: number;
    frames: number;
    startMediaTime: number;
    endMediaTime: number;
    capturedAtStart: number;
    presentationDateMs: number | null;
  } | null> {
    assertProfile(profile);
    if (
      !playback ||
      !Number.isFinite(playback.currentTime) ||
      (playback.currentTime ?? -1) <= 0
    ) {
      return null;
    }

    const dir = path.join(this.rootDir, profile);
    const playlistPath = path.join(dir, "index.m3u8");
    let text: string;
    try {
      text = await readFile(playlistPath, "utf8");
    } catch {
      return null;
    }

    const durations: number[] = [];
    let firstProgramDateTimeMs: number | null = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (
        firstProgramDateTimeMs === null &&
        line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")
      ) {
        const parsed = Date.parse(
          line.slice("#EXT-X-PROGRAM-DATE-TIME:".length),
        );
        if (Number.isFinite(parsed)) firstProgramDateTimeMs = parsed;
      }
      if (line.startsWith("#EXTINF:")) {
        const parsed = Number(line.slice(8).split(",")[0]);
        if (Number.isFinite(parsed) && parsed > 0) durations.push(parsed);
      }
    }
    if (durations.length === 0) return null;

    const totalSeconds = durations.reduce((sum, value) => sum + value, 0);
    const endMediaTime = Math.max(
      0,
      Math.min(totalSeconds, playback.currentTime ?? 0),
    );
    const requested = Math.max(1, Math.min(30, Number(seconds) || 5));
    const startMediaTime = Math.max(0, endMediaTime - requested);
    const durationSeconds = endMediaTime - startMediaTime;
    if (durationSeconds < 0.05) return null;

    const snapshotName =
      ".companion-audio-" +
      process.pid +
      "-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 8) +
      ".m3u8";
    const snapshotPath = path.join(dir, snapshotName);
    const staticPlaylist =
      text.replace(/\s*#EXT-X-ENDLIST\s*$/m, "").trimEnd() +
      "\n#EXT-X-ENDLIST\n";

    try {
      await writeFile(snapshotPath, staticPlaylist, "utf8");
      const buffer = await extractPcmWindow(
        snapshotPath,
        startMediaTime,
        durationSeconds,
      );
      if (!buffer || buffer.length < 128) return null;

      const sampleRate = 48_000;
      const channels = 1;
      const frames = Math.floor(buffer.length / 2 / channels);
      const capturedAtStart =
        firstProgramDateTimeMs !== null
          ? Math.round(firstProgramDateTimeMs + startMediaTime * 1000)
          : Date.now() - Math.round(durationSeconds * 1000);

      return {
        buffer,
        sampleRate,
        channels,
        frames,
        startMediaTime,
        endMediaTime,
        capturedAtStart,
        presentationDateMs: playback.presentationDateMs,
      };
    } finally {
      await unlink(snapshotPath).catch(() => {});
    }
  }

  async file(profile: string, name: string): Promise<Buffer | null> {
    assertProfile(profile);
    if (!SEGMENT_RE.test(name)) return null;
    const file = path.join(this.rootDir, profile, name);
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size <= 0 || info.size > 8_000_000) {
        return null;
      }
      return await readFile(file);
    } catch {
      return null;
    }
  }

  status(profile?: string): Record<string, unknown> {
    const rows = [...this.sessions.values()]
      .filter((session) => !profile || session.profile === profile)
      .map((session) => ({
        profile: session.profile,
        streamId: session.streamId,
        mimeType: session.mimeType,
        videoCopy: session.videoCopy,
        startedAt: new Date(session.startedAt).toISOString(),
        ageMs: Date.now() - session.startedAt,
        bytesIn: session.bytesIn,
        chunksIn: session.chunksIn,
        encodedSeconds: session.encodedSeconds,
        encodedFrames: session.encodedFrames,
        lastEncodedAgeMs:
          session.lastEncodedAt > 0
            ? Date.now() - session.lastEncodedAt
            : null,
        lastChunkAgeMs:
          session.lastChunkAt > 0
            ? Date.now() - session.lastChunkAt
            : null,
        exited: session.exited,
        exitCode: session.exitCode,
        stderrTail: session.stderrTail.slice(-1500),
        sourceTimeline: session.sourceTimeline,
        paused: session.pausedSince !== null,
      }));
    return {
      active: rows.length,
      sessions: rows,
      rootDir: this.rootDir,
      segmentSeconds: 2,
      rollingWindowSeconds: 150,
      recentExits: this.recentExits.slice(0, 8),
    };
  }
}

async function extractJpegFrame(
  playlistPath: string,
  seekSeconds: number,
): Promise<Buffer | null> {
  return await new Promise<Buffer | null>((resolve) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", playlistPath,
        "-ss", Math.max(0, seekSeconds).toFixed(3),
        "-frames:v", "1",
        "-vf", "scale=w=640:h=-2:force_original_aspect_ratio=decrease",
        // Small enough that an AI host shows it inline instead of filing it.
        "-q:v", "9",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > 2_000_000) {
        try { child.kill("SIGKILL"); } catch {}
        finish(null);
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.on("error", () => finish(null));
    child.on("exit", (code) => {
      if (code !== 0 || chunks.length === 0) {
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks));
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish(null);
    }, 6_000);
    timer.unref?.();
  });
}

async function extractPcmWindow(
  playlistPath: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<Buffer | null> {
  return await new Promise<Buffer | null>((resolve) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", playlistPath,
        "-ss", Math.max(0, startSeconds).toFixed(3),
        "-t", Math.max(0.05, durationSeconds).toFixed(3),
        "-vn",
        "-ac", "1",
        "-ar", "48000",
        "-f", "s16le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > 4_000_000) {
        try { child.kill("SIGKILL"); } catch {}
        finish(null);
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.on("error", () => finish(null));
    child.on("exit", (code) => {
      if (code !== 0 || chunks.length === 0) {
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks));
    });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish(null);
    }, 8_000);
    timer.unref?.();
  });
}

function assertProfile(profile: string): void {
  if (!PROFILE_RE.test(profile)) {
    throw new Error("Invalid companion profile.");
  }
}
