import assert from "node:assert/strict";
import test from "node:test";
import { assertModelNavigationUrl, assertModelReadablePageUrl } from "../src/navigation-policy.js";

test("model navigation accepts HTTP(S), including local development sites", () => {
  for (const value of ["https://example.test/a", "http://127.0.0.1:1234/", "http://localhost:8123/"]) {
    assert.doesNotThrow(() => assertModelNavigationUrl(value));
    assert.doesNotThrow(() => assertModelReadablePageUrl(value));
  }
  assert.doesNotThrow(() => assertModelReadablePageUrl("about:blank"));
  assert.throws(() => assertModelNavigationUrl("about:blank"));
});

test("model navigation and current-page reads reject privileged schemes", () => {
  for (const value of [
    "file:///C:/synthetic.txt", "FILE:///C:/synthetic.txt", "data:text/plain,marker",
    "javascript:alert(1)", "chrome://settings/", "devtools://devtools/", "view-source:https://example.test/",
    "file%3A///C:/synthetic.txt", "about:config",
  ]) {
    assert.throws(() => assertModelNavigationUrl(value), value);
    assert.throws(() => assertModelReadablePageUrl(value), value);
  }
});
