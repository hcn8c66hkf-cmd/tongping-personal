import assert from "node:assert/strict";
import test from "node:test";
import { ProfileQueue } from "../src/profile-queue.js";

test("same profile runs serially", async () => {
  const queue = new ProfileQueue();
  const events: string[] = [];

  const first = queue.run("goofish", async () => {
    events.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 25));
    events.push("first:end");
  });

  const second = queue.run("goofish", async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await Promise.all([first, second]);

  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
});

test("different profiles can overlap", async () => {
  const queue = new ProfileQueue();
  const events: string[] = [];

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const a = queue.run("goofish", async () => {
    events.push("goofish:start");
    await gate;
    events.push("goofish:end");
  });

  const b = queue.run("douyin", async () => {
    events.push("douyin:start");
    release();
    events.push("douyin:end");
  });

  await Promise.all([a, b]);

  assert.equal(events[0], "goofish:start");
  assert.ok(events.includes("douyin:start"));
  assert.ok(events.indexOf("douyin:start") < events.indexOf("goofish:end"));
});
