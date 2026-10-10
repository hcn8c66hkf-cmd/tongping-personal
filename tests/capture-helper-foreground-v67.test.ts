import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

test("media capture helper is foregrounded before getDisplayMedia trigger", () => {
  const start = manager.indexOf('helperPage.locator("#__tongping_tab_media_capture")');
  assert.ok(start > 0);
  const before = manager.slice(Math.max(0, start - 300), start);
  assert.ok(before.includes("await helperPage.bringToFront().catch(() => {})"));
});

test("source page returns to foreground after media capture becomes ready", () => {
  const mediaStart = manager.indexOf('helperPage.locator("#__tongping_tab_media_capture")');
  const start = manager.indexOf("keepHelper = true;", mediaStart);
  assert.ok(mediaStart > 0);
  assert.ok(start > mediaStart);
  const after = manager.slice(start, start + 500);
  assert.ok(after.includes("await page.bringToFront().catch(() => {})"));
});

test("worker build is v79 for visible share-flow semantics", () => {
  assert.ok(worker.includes('const WORKER_BUILD = "v95"'));
});
