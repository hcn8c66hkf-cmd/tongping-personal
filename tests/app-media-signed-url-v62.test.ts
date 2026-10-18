import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");

test("signed media URL rotation does not tear down a healthy socket", () => {
  assert.ok(app.includes("function stableSignedSocketTarget(rawUrl)"));
  assert.ok(app.includes('url.searchParams.get("profile")'));
  assert.ok(app.includes("const targetChanged ="));
  assert.ok(app.includes("state.mediaUrl = next.mediaUrl;"));
  const start = app.indexOf('if (typeof next.mediaUrl === "string")');
  const end = app.indexOf('if (typeof next.inputUrl === "string")', start);
  const block = app.slice(start, end);
  assert.ok(block.includes("if (targetChanged)"));
  assert.ok(!block.includes("next.mediaUrl !== state.mediaUrl"));
});

test("App build/resource is v62 for stable signed media authority", () => {
  assert.ok(app.includes("shared-browser-v102"));
  assert.ok(app.includes('appUiBuild: "v93"'));
});
