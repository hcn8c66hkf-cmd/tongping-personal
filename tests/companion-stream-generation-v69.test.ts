import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const hls = fs.readFileSync(new URL("../src/delayed-companion-hls.ts", import.meta.url), "utf8");

test("playlist exposes the current companion stream generation", () => {
  assert.ok(hls.includes('out.push("#TONGPING-STREAM-ID:" + session.streamId)'));
});

test("App observes stream generation without changing the media URL", () => {
  assert.ok(app.includes("let companionStreamId ="));
  assert.ok(app.includes("/#TONGPING-STREAM-ID:"));
  assert.ok(app.includes("const streamChanged ="));
  const start = app.indexOf("const streamChanged =");
  const end = app.indexOf("if (segmentCount >= 2 &&", start);
  const block = app.slice(start, end);
  assert.ok(block.includes("if (streamChanged)"));
  assert.ok(!block.includes("_generation="));
  assert.ok(!block.includes("video.src ="));
});

test("App v79 is the fresh resource identity", () => {
  assert.ok(app.includes("shared-browser-v95"));
});
