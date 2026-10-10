import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("socket open wait re-checks readyState after listener registration", () => {
  const start = worker.indexOf("async function waitForSocketOpen(");
  const end = worker.indexOf("async function poll()", start);
  const block = worker.slice(start, end);
  assert.ok(block.includes('socket.once("open", onOpen)'));
  assert.ok(block.includes("if (socket.readyState === WebSocket.OPEN)"));
  assert.ok(block.includes("settleResolve();"));
  assert.ok(block.includes("let settled = false;"));
});

test("socket open wait rejects terminal state reached during registration gap", () => {
  const start = worker.indexOf("async function waitForSocketOpen(");
  const end = worker.indexOf("async function poll()", start);
  const block = worker.slice(start, end);
  assert.ok(block.includes("WebSocket.CLOSING"));
  assert.ok(block.includes("WebSocket.CLOSED"));
  assert.ok(block.includes("closed during open handshake"));
});

test("worker build is v62 for websocket open race repair", () => {
  assert.match(worker, /const WORKER_BUILD = "v95"/);
});
