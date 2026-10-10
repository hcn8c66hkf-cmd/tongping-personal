import assert from "node:assert/strict";
import test from "node:test";
import { parseBrowserWaitMs } from "../src/action-limits.js";

test("wait accepts only finite integer milliseconds in 0..10000", () => {
  for (const [value, expected] of [[undefined, 1000], [0, 0], [1000, 1000], [10000, 10000]] as const) {
    assert.equal(parseBrowserWaitMs(value), expected);
  }
  for (const value of [-1, 0.5, 10001, 1e12, NaN, Infinity, "1000", null]) {
    assert.throws(() => parseBrowserWaitMs(value), /browser_wait ms/i);
  }
});
