import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const daemon = fs.readFileSync(
  new URL("../src/daemon.ts", import.meta.url),
  "utf8",
);

test("live watchdog does not restart sparse healthy capture every few seconds", () => {
  assert.ok(daemon.includes("if (stallMs < 12_000) continue;"));
  assert.ok(daemon.includes("now - previousAttempt < 20_000"));
  assert.ok(!daemon.includes("if (stallMs < 3_000) continue;"));
});
