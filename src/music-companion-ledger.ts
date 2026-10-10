import type { AudioVisionPoint, AudioVisionEvent, AudioVisionReadout } from "./audio-vision.js";
import type { SafeSubtitleCue } from "./media-context.js";

export interface MusicCompanionSnapshot {
  sessionKey: string;
  cutoffMediaTime: number;
  audioTimeline: AudioVisionPoint[];
  audioEvents: AudioVisionEvent[];
  lyrics: SafeSubtitleCue[];
  coverage: {
    startMediaTime: number | null;
    endMediaTime: number | null;
    pointCount: number;
    lyricCueCount: number;
  };
  futureSealed: true;
}

interface MusicSessionState {
  audioByTime: Map<number, AudioVisionPoint>;
  eventsByKey: Map<string, AudioVisionEvent>;
  lyricsByKey: Map<string, SafeSubtitleCue>;
}

const MAX_AUDIO_POINTS = 18_000;
const MAX_EVENTS = 4_000;
const MAX_LYRIC_CUES = 4_000;

export class MusicCompanionLedger {
  private readonly sessions = new Map<string, MusicSessionState>();

  merge(
    sessionKey: string,
    cutoffMediaTime: number,
    audio: AudioVisionReadout | null,
    lyrics: SafeSubtitleCue[],
  ): MusicCompanionSnapshot {
    const cutoff = finiteTime(cutoffMediaTime) ?? 0;
    let state = this.sessions.get(sessionKey);
    if (!state) {
      state = {
        audioByTime: new Map(),
        eventsByKey: new Map(),
        lyricsByKey: new Map(),
      };
      this.sessions.set(sessionKey, state);
    }

    for (const point of audio?.timeline ?? []) {
      const mediaTime = finiteTime(point.mediaTime);
      if (mediaTime === null || mediaTime > cutoff + 0.05) continue;
      state.audioByTime.set(bucket(mediaTime), { ...point, mediaTime });
    }

    for (const event of audio?.events ?? []) {
      const mediaTime = finiteTime(event.mediaTime);
      if (mediaTime === null || mediaTime > cutoff + 0.05) continue;
      const key = [bucket(mediaTime), event.type, event.from, event.to].join("|");
      state.eventsByKey.set(key, { ...event, mediaTime });
    }

    for (const cue of lyrics) {
      const startTime = finiteTime(cue.startTime);
      const endTime = finiteTime(cue.endTime);
      if (startTime === null || endTime === null || startTime > cutoff + 0.05) continue;
      const safe = {
        ...cue,
        startTime,
        endTime: Math.max(startTime, endTime),
      };
      state.lyricsByKey.set(
        [bucket(startTime), safe.track, safe.language, safe.text].join("|"),
        safe,
      );
    }

    trimOldest(state.audioByTime, MAX_AUDIO_POINTS);
    trimOldest(state.eventsByKey, MAX_EVENTS);
    trimOldest(state.lyricsByKey, MAX_LYRIC_CUES);

    const audioTimeline = [...state.audioByTime.values()]
      .filter((point) => (point.mediaTime ?? Infinity) <= cutoff + 0.05)
      .sort((a, b) => (a.mediaTime ?? 0) - (b.mediaTime ?? 0));
    const audioEvents = [...state.eventsByKey.values()]
      .filter((event) => (event.mediaTime ?? Infinity) <= cutoff + 0.05)
      .sort((a, b) => (a.mediaTime ?? 0) - (b.mediaTime ?? 0));
    const safeLyrics = [...state.lyricsByKey.values()]
      .filter((cue) => cue.startTime <= cutoff + 0.05)
      .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

    return {
      sessionKey,
      cutoffMediaTime: cutoff,
      audioTimeline,
      audioEvents,
      lyrics: safeLyrics,
      coverage: {
        startMediaTime: audioTimeline[0]?.mediaTime ?? safeLyrics[0]?.startTime ?? null,
        endMediaTime:
          audioTimeline.at(-1)?.mediaTime ??
          safeLyrics.at(-1)?.endTime ??
          null,
        pointCount: audioTimeline.length,
        lyricCueCount: safeLyrics.length,
      },
      futureSealed: true,
    };
  }

  reset(sessionKey?: string): void {
    if (sessionKey) this.sessions.delete(sessionKey);
    else this.sessions.clear();
  }
}

function bucket(value: number): number {
  return Math.round(value * 20) / 20;
}

function finiteTime(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}

function trimOldest<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const first = map.keys().next();
    if (first.done) return;
    map.delete(first.value);
  }
}
