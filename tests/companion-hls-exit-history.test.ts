import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");

test("companion HLS retains recent ffmpeg exit diagnostics", () => {
  assert.ok(hls.includes("private readonly recentExits"));
  assert.ok(hls.includes("stderrTail: session.stderrTail.slice(-4000)"));
  assert.ok(hls.includes("if (this.recentExits.length > 12)"));
  assert.ok(hls.includes("recentExits: this.recentExits.slice(0, 8)"));
});
