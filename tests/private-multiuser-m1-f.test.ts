import test from "node:test";
import assert from "node:assert/strict";

import { routeScopeKey } from "../src/route-keys.js";
import {
  fixtureA,
  fixtureAWithSession,
  fixtureB,
  fixtureBWithSession,
} from "./private-multiuser-fixtures.js";

test("M1-F fixtures keep A/default and B/default aliases equal but routes distinct", () => {
  const a = fixtureA();
  const b = fixtureB();

  assert.equal(a.profileAlias, "default");
  assert.equal(b.profileAlias, "default");
  assert.notEqual(routeScopeKey(a.route), routeScopeKey(b.route));
});

test("M1-F fixtures use distinct human owners", () => {
  const a = fixtureA();
  const b = fixtureB();

  assert.notEqual(a.owner.humanUserId, b.owner.humanUserId);
  assert.notEqual(a.route.humanUserId, b.route.humanUserId);
});

test("M1-F fixtures use distinct hosted profile ids despite the same local alias", () => {
  const a = fixtureA();
  const b = fixtureB();

  assert.equal(a.profileAlias, b.profileAlias);
  assert.notEqual(a.route.profileId, b.route.profileId);
});

test("M1-F A fresh-session variant changes only session identity", () => {
  const base = fixtureA();
  const fresh = fixtureAWithSession("session-a-next");

  assert.equal(base.owner.humanUserId, fresh.owner.humanUserId);
  assert.equal(base.route.humanUserId, fresh.route.humanUserId);
  assert.equal(base.route.deviceId, fresh.route.deviceId);
  assert.equal(base.route.profileId, fresh.route.profileId);
  assert.equal(base.profileAlias, fresh.profileAlias);
  assert.notEqual(base.route.sessionId, fresh.route.sessionId);
  assert.notEqual(routeScopeKey(base.route), routeScopeKey(fresh.route));
});

test("M1-F B fresh-session variant changes only session identity", () => {
  const base = fixtureB();
  const fresh = fixtureBWithSession("session-b-next");

  assert.equal(base.owner.humanUserId, fresh.owner.humanUserId);
  assert.equal(base.route.deviceId, fresh.route.deviceId);
  assert.equal(base.route.profileId, fresh.route.profileId);
  assert.equal(base.profileAlias, fresh.profileAlias);
  assert.notEqual(base.route.sessionId, fresh.route.sessionId);
});

test("M1-F fixture builders are deterministic for the same inputs", () => {
  const a1 = fixtureA();
  const a2 = fixtureA();
  const b1 = fixtureBWithSession("session-b-x");
  const b2 = fixtureBWithSession("session-b-x");

  assert.deepEqual(a1, a2);
  assert.deepEqual(b1, b2);
  assert.equal(routeScopeKey(a1.route), routeScopeKey(a2.route));
  assert.equal(routeScopeKey(b1.route), routeScopeKey(b2.route));
});

test("M1-F fixture results are frozen test data", () => {
  const a = fixtureA();

  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.owner), true);
  assert.equal(Object.isFrozen(a.route), true);
});

test("M1-F fresh fixtures do not mutate previously returned fixtures", () => {
  const base = fixtureA();
  const before = routeScopeKey(base.route);

  void fixtureAWithSession("session-a-other");

  assert.equal(routeScopeKey(base.route), before);
  assert.equal(base.route.sessionId, "session-a");
});
