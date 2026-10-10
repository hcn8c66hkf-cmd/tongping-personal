import assert from "node:assert/strict";
import test from "node:test";
import { RemoteWorkerRelay } from "../src/worker-relay.js";

test("remote worker relay round-trips browser calls", async () => {
  const relay = new RemoteWorkerRelay(2_000);
  const pending = relay.call(
    "browser_open",
    { profile: "default", url: "https://example.com" },
    "gpt",
  );

  const command = await relay.nextCommand(50);
  assert.ok(command);
  assert.equal(command.op, "call");
  assert.equal(command.action, "browser_open");
  assert.equal(command.client, "gpt");

  assert.equal(
    relay.complete(command.id, {
      ok: true,
      result: { title: "Example Domain" },
    }),
    true,
  );

  const reply = await pending;
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.result, {
    title: "Example Domain",
  });
});

test("remote worker relay round-trips human input", async () => {
  const relay = new RemoteWorkerRelay(2_000);
  const pending = relay.human(
    "human_pointer",
    {
      profile: "default",
      phase: "move",
      x: 12,
      y: 34,
    },
    "tongping",
  );

  const command = await relay.nextCommand(50);
  assert.ok(command);
  assert.equal(command.op, "human");
  assert.equal(command.action, "human_pointer");

  relay.complete(command.id, {
    ok: true,
    result: { phase: "move" },
  });

  const reply = await pending;
  assert.equal(reply.ok, true);
  assert.equal(
    (reply.result as { phase: string }).phase,
    "move",
  );
  assert.equal(relay.workerStatus().connected, true);
});
