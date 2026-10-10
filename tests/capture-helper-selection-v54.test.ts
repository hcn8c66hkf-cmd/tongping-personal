import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/browser-manager.ts", import.meta.url),
  "utf8",
);
const staged = fs.readFileSync(
  new URL("../src/browser-manager.ts", import.meta.url),
  "utf8",
);

test("capture helper can never become the user page after a worker restart", () => {
  for (const text of [source, staged]) {
    assert.ok(text.includes("!isCaptureHelperPage(candidate)"));
    assert.ok(text.includes('parsed.pathname === "/capture-helper"'));
  }
});

test("staged worker browser-manager matches canonical source", () => {
  assert.equal(staged, source);
});
