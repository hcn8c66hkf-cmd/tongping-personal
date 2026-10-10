// Group-chat identities are "<name>.<entry>": who is talking and through which
// door — claude.chat (claude.ai), claude.code (Claude Code), claude.cloud,
// gpt.chat (ChatGPT), gpt.codex, gpt.work (ChatGPT cloud tasks). A second session on
// the same entry adds "-2". Older names are folded in so mutes, read cursors
// and history keep pointing at the same speaker.
const LEGACY: Record<string, string> = {
  claude: "claude.chat",
  gpt: "gpt.chat",
  codex: "gpt.codex",
};

export function canonicalIdentity(value: string): string {
  const v = String(value ?? "").trim().toLowerCase();
  const legacy = LEGACY[v];
  if (legacy) return legacy;
  // Some sessions wrote name-entry with a dash (gpt-work, claude-code).
  const dashed = /^(claude|gpt)-(chat|code|cloud|codex|work)(-\d+)?$/.exec(v);
  if (dashed) return dashed[1] + "." + dashed[2] + (dashed[3] ?? "");
  // Terminal Claudes used to be claude-<model>[-n].
  const terminal = /^claude-(?:opus|sonnet|fable|haiku)(-\d+)?$/.exec(v);
  if (terminal) return "claude.code" + (terminal[1] ?? "");
  return v;
}
