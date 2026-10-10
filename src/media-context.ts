export interface RawSubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
  track?: string;
  language?: string;
}

export interface SafeSubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
  track: string;
  language: string;
}

export function gateSubtitleCues(
  cues: RawSubtitleCue[],
  currentTime: number,
  lookbackSeconds = 120,
  maxCues = 120,
): SafeSubtitleCue[] {
  const cutoff = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const lookback = Number.isFinite(lookbackSeconds)
    ? Math.max(0, Math.min(3600, lookbackSeconds))
    : 120;
  const earliest = Math.max(0, cutoff - lookback);
  const limit = Math.max(1, Math.min(500, Math.round(maxCues)));

  return cues
    .filter((cue) => (
      Number.isFinite(cue.startTime) &&
      Number.isFinite(cue.endTime) &&
      cue.startTime <= cutoff &&
      cue.endTime >= earliest
    ))
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime)
    .slice(-limit)
    .map((cue) => ({
      startTime: Math.max(0, cue.startTime),
      endTime: Math.max(0, cue.endTime),
      text: cleanCueText(cue.text),
      track: cleanLabel(cue.track),
      language: cleanLabel(cue.language),
    }))
    .filter((cue) => cue.text.length > 0);
}

function cleanCueText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function cleanLabel(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
