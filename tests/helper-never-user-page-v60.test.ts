import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("profile listing excludes both registered media helpers and capture-helper URLs", () => {
  const start = manager.indexOf("async listProfiles()");
  const end = manager.indexOf("async read(", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("!this.audioHelperPages.has(page)"));
  assert.ok(block.includes("!this.mediaHelperPages.has(page)"));
  assert.ok(block.includes("!isCaptureHelperPage(page)"));
});

test("generic latest-open-page helper never returns capture-helper", () => {
  const start = manager.indexOf("function latestOpenPage(");
  const end = manager.indexOf("function isCaptureHelperPage", start);
  const block = manager.slice(start, end);
  assert.ok(block.includes("!isCaptureHelperPage(page)"));
});

test("worker build is v60 for the helper-page ownership repair", () => {
  assert.match(worker, /const WORKER_BUILD = "v95"/);
});
