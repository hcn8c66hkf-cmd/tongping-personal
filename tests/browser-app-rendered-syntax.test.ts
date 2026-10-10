import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderBrowserApp } from "../src/browser-app.js";

test("rendered MCP App module is valid JavaScript after template interpolation", () => {
  const html = renderBrowserApp("https://browser.example.test");
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match?.[1], "module script should exist");

  const dir = mkdtempSync(path.join(os.tmpdir(), "tongping-app-js-"));
  const file = path.join(dir, "app.mjs");
  try {
    writeFileSync(file, match[1], "utf8");
    const result = spawnSync(
      process.execPath,
      ["--check", file],
      { encoding: "utf8" },
    );
    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout || "rendered app syntax failed",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
