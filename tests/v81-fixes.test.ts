import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name: string) =>
  fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("the send arrow types and then submits with Enter", () => {
  const app = read("browser-app.ts");
  const fn = app.slice(app.indexOf("async function sendHumanText() {"), app.indexOf("async function key(name) {"));
  assert.ok(fn.indexOf('call("browser_app_type"') < fn.indexOf('call("browser_app_key", actorArgs({ key: "Enter" }))'));
});

test("live sound turns on at the first tap unless the viewer switched it off", () => {
  const app = read("browser-app.ts");
  assert.match(app, /document\.addEventListener\("pointerdown", armDefaultLiveSound, true\);/);
  assert.match(app, /if \(readPref\("tongping-live-sound"\) === "0"\)/);
  assert.match(app, /writePref\("tongping-live-sound", "0"\);\n    closeAudioSocket\(true\);/);
});

test("a fresh companion entry rewinds a clip that only just started, once per entry", () => {
  const daemon = read("daemon.ts");
  assert.match(daemon, /const COMPANION_REWIND_MAX_SECONDS = 90;/);
  assert.match(daemon, /companionRewindCheckedEntry\.get\(profile\) !== entry/);
  assert.match(daemon, /"browser_media_seek", \{ profile, targetSeconds: 0 \}, "companion-start-from-top"/);
  assert.match(daemon, /workerBuildAtLeast\(lastWorkerBuild, 73\)/);
});

test("seek targets the on-screen video and installs the __name shim", () => {
  const manager = read("browser-manager.ts");
  const seek = manager.slice(manager.indexOf("  async seekMedia("));
  assert.ok(seek.indexOf("await this.ensureNameShim(page);") > 0);
  assert.equal(
    seek.split('(element.tagName === "VIDEO" && visibleArea(element) > 0 ? 1_000_000_000_000 : 0)').length - 1,
    2,
  );
  assert.match(read("worker-client.ts"), /const WORKER_BUILD = "v95"/);
});
