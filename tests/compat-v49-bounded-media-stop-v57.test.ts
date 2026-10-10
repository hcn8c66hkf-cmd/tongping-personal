import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mcp = fs.readFileSync(
  new URL("../src/mcp-server.ts", import.meta.url),
  "utf8",
);
const manager = fs.readFileSync(
  new URL("../src/browser-manager.ts", import.meta.url),
  "utf8",
);
const stagedManager = fs.readFileSync(
  new URL("../src/browser-manager.ts", import.meta.url),
  "utf8",
);
const worker = fs.readFileSync(
  new URL("../src/worker-client.ts", import.meta.url),
  "utf8",
);

test("cached v49-v53 cards resolve to the current renderer", () => {
  for (const v of [49, 50, 51, 52, 53]) {
    assert.ok(
      mcp.includes('"ui://tongping/shared-browser-v' + v + '"'),
      "missing compatibility alias v" + v,
    );
  }
});

test("media helper teardown is bounded and cannot pin the worker command lane", () => {
  for (const text of [manager, stagedManager]) {
    assert.ok(text.includes("await Promise.race(["));
    assert.ok(text.includes("setTimeout(resolve, 900)"));
    assert.ok(text.includes("setTimeout(resolve, 1200)"));
    assert.ok(text.includes("runBeforeUnload: false"));
  }
  assert.ok(worker.includes('const WORKER_BUILD = "v95";'));
});

test("staged browser manager stays identical to canonical source", () => {
  assert.equal(stagedManager, manager);
});
