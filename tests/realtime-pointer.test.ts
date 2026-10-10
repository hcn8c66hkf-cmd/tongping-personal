import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("v50 realtime control websocket supports pointer and live restart", async () => {
  const worker = await readFile(
    new URL("../src/worker-client.ts", import.meta.url),
    "utf8",
  );
  const daemon = await readFile(
    new URL("../src/daemon.ts", import.meta.url),
    "utf8",
  );

  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /message\.type !== "pointer"/);
  assert.match(worker, /humanPointerRealtime/);
  assert.match(worker, /\/v1\/worker\/control-ws/);
  assert.match(worker, /worker_command_ack/);
  assert.match(worker, /worker_command_result/);
  assert.match(worker, /message\.button !== "left"/);
  assert.match(worker, /message\.button !== "right"/);
  assert.match(worker, /clickCount/);

  assert.match(daemon, /liveWsHub\s*\.workerCommand/);
  assert.match(daemon, /type: "pointer"/);
  assert.match(daemon, /button, clickCount/);
  assert.doesNotMatch(
    daemon,
    /\.human\(\s*"human_pointer",\s*\{ profile, phase, x, y \},\s*"app-ws"/,
  );
  assert.match(worker, /message\.type === "live_restart"/);
});
