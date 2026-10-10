import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("starting media capture closes every leftover media helper first", () => {
  const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
  const start = manager.lastIndexOf("const helperPage = await page.context().newPage();");
  const sweep = manager.lastIndexOf("for (const stale of page.context().pages()) {", start);
  assert.ok(sweep > 0 && start - sweep < 1500);
  assert.match(manager, /!isCaptureHelperPage\(stale\) \|\|\n        this\.audioHelperPages\.has\(stale\)/);
});
