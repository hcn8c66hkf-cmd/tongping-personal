export interface CompanionVisualCueInput {
  mediaContext: unknown;
  audioVision: unknown;
  lastVisualInspectionAt?: number | null;
  now?: number;
  silenceThresholdSeconds?: number;
  cooldownSeconds?: number;
  noSubtitleHeartbeatSeconds?: number;
}

export interface CompanionVisualCue {
  shouldLook: boolean;
  priority: "none" | "medium" | "high";
  reasons: string[];
  silenceSeconds: number | null;
  longSilence: boolean;
  audioShift: boolean;
  noSubtitleSource: boolean;
  visualHeartbeat: boolean;
  cooldown: {
    active: boolean;
    secondsRemaining: number;
    bypassedByAudioShift: boolean;
  };
}

export function assessCompanionVisualCue(
  input: CompanionVisualCueInput,
): CompanionVisualCue {
  const now = Number.isFinite(input.now)
    ? Number(input.now)
    : Date.now();
  const silenceThreshold = clamp(
    finiteOr(input.silenceThresholdSeconds, 5),
    2,
    30,
  );
  const cooldownSeconds = clamp(
    finiteOr(input.cooldownSeconds, 4),
    0,
    30,
  );
  const noSubtitleHeartbeatSeconds = clamp(
    finiteOr(input.noSubtitleHeartbeatSeconds, 10),
    5,
    60,
  );

  const media = asRecord(input.mediaContext);
  const mediaState = asRecord(media.media);
  const currentTime = finiteNumber(mediaState.currentTime);
  const mediaTag = typeof mediaState.tag === "string" ? mediaState.tag : "";
  const mediaPaused = mediaState.paused === true;
  const subtitleSource = typeof media.source === "string" ? media.source : "";
  const subtitles = Array.isArray(media.subtitles)
    ? media.subtitles
    : [];

  let lastCueEnd: number | null = null;
  for (const value of subtitles) {
    const cue = asRecord(value);
    const endTime = finiteNumber(cue.endTime);
    const startTime = finiteNumber(cue.startTime);
    if (
      currentTime === null ||
      endTime === null ||
      startTime === null ||
      startTime > currentTime
    ) {
      continue;
    }
    const boundedEnd = Math.min(currentTime, Math.max(startTime, endTime));
    if (lastCueEnd === null || boundedEnd > lastCueEnd) {
      lastCueEnd = boundedEnd;
    }
  }

  const silenceSeconds =
    currentTime !== null && lastCueEnd !== null
      ? round(Math.max(0, currentTime - lastCueEnd), 3)
      : null;
  const longSilence =
    silenceSeconds !== null && silenceSeconds >= silenceThreshold;
  const noSubtitleSource =
    mediaTag === "video" &&
    !mediaPaused &&
    currentTime !== null &&
    subtitles.length === 0 &&
    (subtitleSource === "none" || subtitleSource === "");

  const audio = asRecord(input.audioVision);
  const events = Array.isArray(audio.events) ? audio.events : [];
  const audioShift = events.some((value) => {
    const event = asRecord(value);
    if (event.type !== "section_change") return false;
    const energyDelta = Math.abs(finiteOr(event.energyDelta, 0));
    const onsetDelta = Math.abs(finiteOr(event.onsetDelta, 0));
    const harmonicChange = finiteOr(event.harmonicChange, 0);
    const to = typeof event.to === "string" ? event.to : "";
    return (
      energyDelta >= 0.18 ||
      onsetDelta >= 0.8 ||
      harmonicChange >= 0.45 ||
      to === "build" ||
      to === "peak"
    );
  });

  const lastVisualAt = finiteNumber(input.lastVisualInspectionAt);
  const cooldownElapsedSeconds =
    lastVisualAt === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (now - lastVisualAt) / 1000);
  const visualHeartbeat =
    noSubtitleSource &&
    cooldownElapsedSeconds >= noSubtitleHeartbeatSeconds;
  const cooldownActive =
    cooldownSeconds > 0 && cooldownElapsedSeconds < cooldownSeconds;
  const secondsRemaining = cooldownActive
    ? round(cooldownSeconds - cooldownElapsedSeconds, 3)
    : 0;
  const bypassedByAudioShift = cooldownActive && audioShift;

  const reasons: string[] = [];
  if (longSilence) reasons.push("long-subtitle-silence");
  if (audioShift) reasons.push("audio-vision-shift");
  if (noSubtitleSource) reasons.push("subtitle-source-unavailable");
  if (visualHeartbeat) reasons.push("visual-heartbeat");
  if (longSilence && audioShift) reasons.push("combined-action-likelihood");
  if (cooldownActive && !bypassedByAudioShift) {
    reasons.push("visual-cooldown");
  }
  if (bypassedByAudioShift) {
    reasons.push("cooldown-bypassed-by-audio-shift");
  }

  const signal = longSilence || audioShift || visualHeartbeat;
  const shouldLook =
    signal && (!cooldownActive || bypassedByAudioShift);
  const priority: CompanionVisualCue["priority"] =
    shouldLook && longSilence && audioShift
      ? "high"
      : shouldLook
        ? "medium"
        : "none";

  return {
    shouldLook,
    priority,
    reasons,
    silenceSeconds,
    longSilence,
    audioShift,
    noSubtitleSource,
    visualHeartbeat,
    cooldown: {
      active: cooldownActive,
      secondsRemaining,
      bypassedByAudioShift,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function finiteOr(value: unknown, fallback: number): number {
  return finiteNumber(value) ?? fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
