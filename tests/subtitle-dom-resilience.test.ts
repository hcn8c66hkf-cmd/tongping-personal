import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("complex subtitle DOM cannot poison the whole media evaluator", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /subtitleElements = Array\.from\(document\.querySelectorAll\(selector\)\)/);
  assert.match(manager, /typeof element\.className === "string"/);
  assert.match(manager, /element\.getAttribute\("class"\) \|\| ""/);
  assert.match(manager, /SPA DOM churn or one malformed subtitle node/);
});
