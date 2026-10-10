import test from "node:test";
import assert from "node:assert/strict";
import { AppChatRoom } from "../src/app-chat-ledger.js";

test("group chat room keeps the user and every AI in one conversation", () => {
  const room = new AppChatRoom();
  const user = room.push({ profile: "chat-test", identity: "gpt", role: "user", text: "hello", clientId: "user-1" });
  const duplicate = room.push({ profile: "chat-test", identity: "gpt", role: "user", text: "hello", clientId: "user-1" });
  room.push({ profile: "chat-test", identity: "gpt", role: "assistant", text: "hi from gpt" });
  room.push({ profile: "douyin", identity: "claude", role: "assistant", text: "hi from claude" });

  assert.equal(user.seq, duplicate.seq);
  const all = room.read("anything", "claude", 0);
  assert.deepEqual(all.messages.map((x) => x.identity + ":" + x.text), [
    "gpt.chat:hello", "gpt.chat:hi from gpt", "claude.chat:hi from claude",
  ]);
});

test("unread returns what an AI missed and advances its cursor", () => {
  const room = new AppChatRoom();
  room.push({ profile: "p", identity: "gpt", role: "user", text: "u1" });
  room.push({ profile: "p", identity: "gpt", role: "assistant", text: "s1" });
  const first = room.unread("claude");
  assert.deepEqual(first.messages.map((x) => x.text), ["u1", "s1"]);
  assert.equal(room.unread("claude").messages.length, 0);
  room.push({ profile: "p", identity: "claude", role: "assistant", text: "c1" });
  assert.equal(room.peekUnread("claude").length, 0);
  assert.deepEqual(room.peekUnread("gpt").map((x) => x.text), ["c1"]);
});

test("a muted AI cannot post until unmuted; the user still can", () => {
  const room = new AppChatRoom();
  room.setMuted("gpt", true);
  assert.throws(() => room.push({ profile: "p", identity: "gpt", role: "assistant", text: "x" }), /muted/);
  room.push({ profile: "p", identity: "gpt", role: "user", text: "still here" });
  assert.deepEqual(room.read().muted, ["gpt.chat"]);
  room.setMuted("gpt", false);
  room.push({ profile: "p", identity: "gpt", role: "assistant", text: "back" });
  assert.equal(room.read().messages.at(-1)?.text, "back");
});

test("group chat room is bounded to recent messages", () => {
  const room = new AppChatRoom();
  for (let i = 0; i < 230; i += 1) {
    room.push({ profile: "p", identity: "gpt", role: i % 2 === 0 ? "user" : "assistant", text: "m" + i });
  }
  const all = room.read();
  assert.equal(all.messages.length, 200);
  assert.equal(all.messages.at(-1)?.text, "m229");
});

test("clearing the room keeps seq moving forward, mutes and cursors", () => {
  const room = new AppChatRoom();
  room.push({ profile: "default", identity: "gpt", role: "user", text: "one" });
  room.push({ profile: "default", identity: "claude", role: "assistant", text: "two" });
  room.setMuted("gpt", true);
  const watcher = room.unread("claude");
  assert.equal(watcher.latestSeq, 2);

  assert.equal(room.clearMessages(), 2);
  const empty = room.read(undefined, undefined, 0);
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.clearedThroughSeq, 2);
  assert.equal(empty.latestSeq, 2);
  assert.deepEqual(empty.muted, ["gpt.chat"]);

  const next = room.push({ profile: "default", identity: "gpt", role: "user", text: "after" });
  assert.equal(next.seq, 3, "a watcher polling after=2 still sees new messages");
  assert.deepEqual(room.read(undefined, undefined, 2).messages.map((m) => m.text), ["after"]);
  assert.deepEqual(room.unread("claude").messages.map((m) => m.text), ["after"]);
});
