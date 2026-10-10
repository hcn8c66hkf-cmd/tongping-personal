export interface CompanionHlsLiveness {
  exited: boolean;
  ageMs: number;
  chunksIn: number;
  lastChunkAgeMs: number | null;
}

export function companionHlsRecoveryReason(
  session: CompanionHlsLiveness,
  now: number,
  lastAttemptAt: number,
  stallMs = 10_000,
): "exited" | "stalled" | null {
  if (now - lastAttemptAt < 30_000) return null;
  if (session.exited) return "exited";
  if (
    session.ageMs >= 15_000 &&
    session.chunksIn > 0 &&
    session.lastChunkAgeMs !== null &&
    session.lastChunkAgeMs >= stallMs
  ) {
    return "stalled";
  }
  return null;
}

// A replacement media viewer (reconnect, or a second card taking over) must
// not tear down a capture that is still producing. Restarting it mid-stream
// resets every viewer's buffer and can feed ffmpeg a headerless WebM tail.
export function companionHlsSessionHealthy(
  session: CompanionHlsLiveness,
): boolean {
  return (
    !session.exited &&
    session.chunksIn > 0 &&
    session.lastChunkAgeMs !== null &&
    session.lastChunkAgeMs < 5_000
  );
}
