import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Bilibili caption text wins while subtitle control menus are excluded", () => {
  const manager = fs.readFileSync(
    new URL("../src/browser-manager.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /\[role="caption"\]/);
  assert.match(manager, /bpx-player-ctrl-subtitle/);
  assert.match(manager, /subtitleControlAncestor/);
  assert.match(manager, /subtitle-panel-text/);
  assert.match(manager, /b\.priority - a\.priority/);
});
