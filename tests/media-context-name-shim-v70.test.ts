import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");

test("media context and companion keepalive install the __name shim first", () => {
  const read = manager.slice(manager.indexOf("  async readMediaContext("));
  assert.ok(
    read.indexOf("await this.ensureNameShim(page);") <
      read.indexOf("for (const frame of frames)"),
  );
  const keep = manager.slice(manager.indexOf("    if (keepSourcePlaying) {"));
  assert.ok(
    keep.indexOf("await this.ensureNameShim(page);") <
      keep.indexOf("await page.evaluate(() => {"),
  );
  assert.match(manager, /page\.frames\(\)\.map\(\(frame\) => frame\.evaluate\(shim\)/);
});
