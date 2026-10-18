import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");

test("stable media socket target ignores exp/sig but includes app_build", () => {
  const start = app.indexOf("function stableSignedSocketTarget");
  const end = app.indexOf("function applyState", start);
  const block = app.slice(start, end);
  assert.ok(block.includes('url.searchParams.get("profile")'));
  assert.ok(block.includes('url.searchParams.get("app_build")'));
  assert.ok(block.includes("&app_build="));
  assert.ok(block.includes("(exp|sig)"));
});

test("App v66 build change can force media socket replacement", () => {
  assert.ok(app.includes("shared-browser-v100"));
  const start = app.indexOf('if (typeof next.mediaUrl === "string")');
  const end = app.indexOf('if (typeof next.inputUrl === "string")', start);
  const block = app.slice(start, end);
  assert.ok(block.includes("stableSignedSocketTarget(next.mediaUrl)"));
  assert.ok(block.includes("closeMediaSocket"));
});
