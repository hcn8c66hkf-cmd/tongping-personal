import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("after 30s without a mirrored reply the panel points to the host conversation", () => {
  const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
  assert.match(app, /if \(waited >= 30000\) \{/);
  assert.match(app, /可能已经在主对话里回复了，往下滑看看/);
  assert.match(app, /\[REQUIRED, do not skip\] IN-APP CHAT RELAY/);
});
