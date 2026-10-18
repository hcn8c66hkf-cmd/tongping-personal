import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");

test("first real HLS generation stays on the original playwait media URL", () => {
  assert.ok(app.includes("companionPlaybackWaitUrl()"));
  assert.ok(app.includes("const nextStreamId ="));
  assert.ok(app.includes("if (nextStreamId) companionStreamId = nextStreamId"));
  const start = app.indexOf("const streamChanged =");
  const end = app.indexOf("if (segmentCount >= 2 &&", start);
  const block = app.slice(start, end);
  assert.ok(!block.includes("_generation="));
  assert.ok(!block.includes("video.src ="));
});

test("playwait now spans repeated capture self-heals", () => {
  assert.ok(daemon.includes("const deadline = Date.now() + 180_000;"));
});

test("App v79 is the fresh resource identity", () => {
  assert.ok(app.includes("shared-browser-v98"));
});
