import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("live screencast teardown is bounded and v49 exposes realtime restart", () => {
  const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

  assert.match(manager, /Page\.stopScreencast/);
  assert.match(manager, /setTimeout\(resolve, 650\)/);
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /message\.type === "live_restart"/);
  assert.match(daemon, /workerBuildAtLeast\(lastWorkerBuild, 36\)/);
  assert.match(daemon, /workerCommand\(profile, \{ type: "live_restart" \}/);
});
