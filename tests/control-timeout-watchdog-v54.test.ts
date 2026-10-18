import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(
  new URL("../src/worker-client.ts", import.meta.url),
  "utf8",
);
const staged = fs.readFileSync(
  new URL("../src/worker-client.ts", import.meta.url),
  "utf8",
);
const app = fs.readFileSync(
  new URL("../src/browser-app.ts", import.meta.url),
  "utf8",
);

test("worker screencast watchdog tolerates sustained sparse-frame periods", () => {
  for (const text of [worker, staged]) {
    assert.ok(text.includes("now - health.lastFrameAt < 15_000"));
    assert.ok(text.includes("now - previousRestartAt < 30_000"));
    assert.ok(text.includes("liveWatchdogLastRestartAt.set(profile, now)"));
    // v89 changed only the hosted media lane; the personal staged copy stays v88.
    assert.ok(text.includes(text === worker ? 'const WORKER_BUILD = "v95";' : 'const WORKER_BUILD = "v88";'));
    assert.ok(!text.includes("now - health.lastFrameAt < 1_800"));
  }
});

test("pointer timeout covers the daemon's eight-second worker command envelope", () => {
  const start = app.indexOf("async function postPointer");
  const end = app.indexOf("async function clickRemote", start);
  const body = app.slice(start, end);
  assert.ok(body.includes("}, 9000);"));
  assert.ok(app.includes("shared-browser-v101"));
});
