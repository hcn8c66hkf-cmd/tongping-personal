import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalIdentity } from "../src/identity-alias.js";
import { AppChatRoom } from "../src/app-chat-ledger.js";

test("identities are name.entry; older names fold in", () => {
  assert.equal(canonicalIdentity("claude"), "claude.chat");
  assert.equal(canonicalIdentity("GPT"), "gpt.chat");
  assert.equal(canonicalIdentity("codex"), "gpt.codex");
  assert.equal(canonicalIdentity("claude-opus"), "claude.code");
  assert.equal(canonicalIdentity("claude-sonnet-2"), "claude.code-2");
  assert.equal(canonicalIdentity("gpt.work"), "gpt.work");
  assert.equal(canonicalIdentity("gpt-work"), "gpt.work");
  assert.equal(canonicalIdentity("claude-code-2"), "claude.code-2");
  assert.equal(canonicalIdentity("claude.code-2"), "claude.code-2");
});

test("an old room file keeps its mutes, cursors and speakers under new names", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-"));
  const file = path.join(dir, "app-chat-room.json");
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    nextSeq: 3,
    messages: [
      { seq: 1, id: "a", profile: "default", identity: "claude-opus", role: "assistant", text: "hi", createdAt: "2026-10-01T00:00:00Z" },
      { seq: 2, id: "b", profile: "default", identity: "gpt", role: "assistant", text: "yo", createdAt: "2026-10-01T00:00:01Z" },
    ],
    muted: ["claude"],
    cursors: { "claude-opus": 1, gpt: 2 },
    clearedThroughSeq: 0,
  }));
  const room = new AppChatRoom(file);
  assert.equal(room.isMuted("claude.chat"), true);
  assert.equal(room.isMuted("claude"), true);
  assert.equal(room.isMuted("claude.code"), false);
  const read = room.read("default", "claude.code", 0);
  assert.deepEqual(read.messages.map((m) => m.identity), ["claude.code", "gpt.chat"]);
  // claude.code already read seq 1 (its own); only GPT's message is unread.
  assert.deepEqual(room.unread("claude-opus").messages.map((m) => m.seq), [2]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the card shows who and which entry", () => {
  const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
  assert.match(app, /return entry \? shown \+ "·" \+ entry : shown;/);
  assert.match(app, /const CHAT_MEMBERS = \["claude\.chat", "gpt\.chat"\];/);
});

test("the card's rendered identity regexes keep their \d escapes", async () => {
  const { renderBrowserApp } = await import("../src/browser-app.js");
  const html = renderBrowserApp("https://example.test");
  assert.ok(html.includes(String.raw`(claude|gpt)-(chat|code|cloud|codex|work)(-\d+)?$/`));
  assert.ok(html.includes(String.raw`^claude-(?:opus|sonnet|fable|haiku)(-\d+)?$/`));
});
