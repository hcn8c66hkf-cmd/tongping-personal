import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("companion subtitles are windowed on the user's clock, while music history is opt-in", () => {
  const server = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
  const ctx = server.slice(server.indexOf('"browser_companion_context",'));

  assert.match(ctx, /cumulativeMusicHistory: z\.boolean\(\)\.default\(false\)/);
  assert.match(
    ctx,
    /lookbackSeconds: cumulativeMusicHistory\s*\? 3600\s*: Math\.min\(3600, lookbackSeconds \+ 900\)/,
  );
  assert.match(
    ctx,
    /delayedCutoff - \(cumulativeMusicHistory \? delayedCutoff : lookbackSeconds\)/,
  );
});
