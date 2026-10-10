import assert from "node:assert/strict";
import test from "node:test";
import { bearerMatches } from "../src/auth.js";

test("bearer token must match exactly", () => {
  assert.equal(bearerMatches("Bearer tongping-secret", "tongping-secret"), true);
  assert.equal(bearerMatches("Bearer tongping-wrong", "tongping-secret"), false);
  assert.equal(bearerMatches("tongping-secret", "tongping-secret"), false);
  assert.equal(bearerMatches(undefined, "tongping-secret"), false);
});
