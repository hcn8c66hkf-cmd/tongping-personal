import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DelayedCompanionHls } from "../src/delayed-companion-hls.js";

test("finished recordings are deleted; an active session's directory is kept", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tongping-purge-"));
  const hls = new DelayedCompanionHls(root);
  try {
    for (const name of ["old", "stale"]) {
      fs.mkdirSync(path.join(root, name));
      fs.writeFileSync(path.join(root, name, "seg_x_0000000001.m4s"), "x");
    }
    await hls.purge("old");
    assert.equal(fs.existsSync(path.join(root, "old")), false);
    await hls.purgeAll();
    assert.equal(fs.existsSync(path.join(root, "stale")), false);
  } finally {
    await hls.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("leaving companion purges after stop; the daemon clears leftovers at start", () => {
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
  assert.match(daemon, /void delayedCompanionHls\.purge\(profile\);/);
  assert.match(daemon, /if \(mediaWsHub\.appMode\(profile\) === "companion"\) return;/);
  assert.match(daemon, /void delayedCompanionHls\.purgeAll\(\);/);
});
