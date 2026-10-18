import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");

test("compact companion overlay always exposes explicit cache seconds", () => {
  assert.ok(app.includes('id="companionCounter"'));
  assert.ok(app.includes('"缓存 " + cachedSeconds + " / " + companionDelaySeconds + " 秒"'));
  assert.ok(app.includes("@media(max-width:520px)"));
  assert.ok(app.includes(".companionPrep{padding:8px 12px}"));
  assert.ok(app.includes("shared-browser-v99"));
});
