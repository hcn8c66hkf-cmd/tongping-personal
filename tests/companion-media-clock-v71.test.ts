import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name: string) =>
  fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("companion source sampling uses the clock-only read, never the subtitle scan", () => {
  const daemon = read("daemon.ts");
  const refresh = daemon.slice(
    daemon.indexOf("async function refreshCompanionSourceTimeline("),
    daemon.indexOf("function clearCompanionRetry("),
  );
  assert.match(refresh, /workerBuildAtLeast\(lastWorkerBuild, 71\)\s*\? await browserGateway\.human\(\s*"human_media_clock"/);
  const sampler = daemon.slice(daemon.indexOf("const companionSourceSampler"));
  assert.match(sampler.slice(0, 1200), /!workerBuildAtLeast\(lastWorkerBuild, 71\)/);
});

test("the clock read has no subtitle scan and no named helpers needing a shim", () => {
  const manager = read("browser-manager.ts");
  const clock = manager.slice(
    manager.indexOf("  async readMediaClock("),
    manager.indexOf("  async readMediaContext("),
  );
  assert.ok(clock.length > 0);
  assert.doesNotMatch(clock, /subtitle|textTracks|querySelectorAll\(selector\)/);
  assert.doesNotMatch(clock, /const \w+ = \(/);
  assert.match(clock, /setTimeout\(\(\) => resolve\(null\), 1500\)/);
  const worker = read("worker-client.ts");
  assert.match(worker, /const WORKER_BUILD = "v95"/);
  assert.match(worker, /command\.action === "human_media_clock"/);
});

test("the clock reads the on-screen video, not a preloaded off-screen one", () => {
  const manager = read("browser-manager.ts");
  const clock = manager.slice(
    manager.indexOf("  async readMediaClock("),
    manager.indexOf("  async readMediaContext("),
  );
  assert.match(clock, /\(area > 0 \? 1_000_000_000_000 : 0\) \+\s*\(video\.paused \? 0 : 1_000_000_000\)/);
  assert.match(clock, /style\.visibility === "hidden"/);
});
