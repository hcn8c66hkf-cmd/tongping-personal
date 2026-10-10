import test from "node:test";
import assert from "node:assert/strict";

import {
  brandAgentIdentity,
  brandCollectionId,
  brandDeviceId,
  brandHostedProfileId,
  brandHumanUserId,
  brandProfileAlias,
  brandRoomId,
  brandSessionId,
  agentRouteScope,
  collectionOwnership,
  ownerScope,
  ownerScopeFromRoute,
  roomOwnership,
  routeScope,
  type DeviceId,
  type HostedProfileId,
  type HumanUserId,
  type ProfileAlias,
  type SessionId,
} from "../src/route-identity.js";
import {
  collectionOwnerKey,
  ownerScopeKey,
  roomOwnerKey,
  routeScopeKey,
} from "../src/route-keys.js";
import {
  fixtureA,
  fixtureB,
} from "./private-multiuser-fixtures.js";

test("M1-A brands keep hosted profile identity separate from local alias", () => {
  const alias = brandProfileAlias("default");
  const hosted = brandHostedProfileId("profile-a");

  const aliasTyped: ProfileAlias = alias;
  const hostedTyped: HostedProfileId = hosted;
  assert.equal(aliasTyped, "default");
  assert.equal(hostedTyped, "profile-a");

  // @ts-expect-error local aliases are not hosted profile identity
  const badHosted: HostedProfileId = alias;
  // @ts-expect-error hosted profile identity is not a local alias
  const badAlias: ProfileAlias = hosted;
  void badHosted;
  void badAlias;
});

test("M1-A brands keep human, device and session identities non-interchangeable", () => {
  const human = brandHumanUserId("human-a");
  const device = brandDeviceId("device-a");
  const session = brandSessionId("session-a");

  const humanTyped: HumanUserId = human;
  const deviceTyped: DeviceId = device;
  const sessionTyped: SessionId = session;
  assert.equal(humanTyped, "human-a");
  assert.equal(deviceTyped, "device-a");
  assert.equal(sessionTyped, "session-a");

  // @ts-expect-error device ids are not human ids
  const badHuman: HumanUserId = device;
  // @ts-expect-error session ids are not device ids
  const badDevice: DeviceId = session;
  void badHuman;
  void badDevice;
});

test("A/default and B/default remain distinct hosted routes", () => {
  const a = fixtureA();
  const b = fixtureB();

  assert.equal(a.profileAlias, b.profileAlias);
  assert.equal(a.profileAlias, "default");
  assert.notEqual(routeScopeKey(a.route), routeScopeKey(b.route));
});

test("route key changes when only the human owner changes", () => {
  const device = brandDeviceId("device-a");
  const session = brandSessionId("session-a");
  const profile = brandHostedProfileId("profile-a");

  assert.notEqual(
    routeScopeKey(
      routeScope(brandHumanUserId("human-a"), device, session, profile),
    ),
    routeScopeKey(
      routeScope(brandHumanUserId("human-b"), device, session, profile),
    ),
  );
});

test("route key changes with device", () => {
  const human = brandHumanUserId("human-a");
  const session = brandSessionId("session-a");
  const profile = brandHostedProfileId("profile-a");

  assert.notEqual(
    routeScopeKey(
      routeScope(human, brandDeviceId("device-a"), session, profile),
    ),
    routeScopeKey(
      routeScope(human, brandDeviceId("device-b"), session, profile),
    ),
  );
});

test("route key changes with session", () => {
  const human = brandHumanUserId("human-a");
  const device = brandDeviceId("device-a");
  const profile = brandHostedProfileId("profile-a");

  assert.notEqual(
    routeScopeKey(
      routeScope(human, device, brandSessionId("session-a"), profile),
    ),
    routeScopeKey(
      routeScope(human, device, brandSessionId("session-b"), profile),
    ),
  );
});

test("route key changes with hosted profile id", () => {
  const human = brandHumanUserId("human-a");
  const device = brandDeviceId("device-a");
  const session = brandSessionId("session-a");

  assert.notEqual(
    routeScopeKey(
      routeScope(human, device, session, brandHostedProfileId("profile-a")),
    ),
    routeScopeKey(
      routeScope(human, device, session, brandHostedProfileId("profile-b")),
    ),
  );
});

test("owner scope projects from route without device/session/profile ownership", () => {
  const human = brandHumanUserId("human-a");
  const route = routeScope(
    human,
    brandDeviceId("device-a"),
    brandSessionId("session-a"),
    brandHostedProfileId("profile-a"),
  );

  assert.deepEqual(ownerScopeFromRoute(route), ownerScope(human));
});

test("persistent room owner key is session independent", () => {
  const human = brandHumanUserId("human-a");
  const room = brandRoomId("room-a");
  const owner = ownerScope(human);

  const sessionA = routeScope(
    human,
    brandDeviceId("device-a"),
    brandSessionId("session-a"),
    brandHostedProfileId("profile-a"),
  );
  const sessionB = routeScope(
    human,
    brandDeviceId("device-b"),
    brandSessionId("session-b"),
    brandHostedProfileId("profile-b"),
  );

  assert.equal(roomOwnerKey(ownerScopeFromRoute(sessionA), room), roomOwnerKey(owner, room));
  assert.equal(roomOwnerKey(ownerScopeFromRoute(sessionB), room), roomOwnerKey(owner, room));
});

test("persistent collection owner key is session independent", () => {
  const human = brandHumanUserId("human-a");
  const collection = brandCollectionId("collection-a");
  const owner = ownerScope(human);

  const a = routeScope(
    human,
    brandDeviceId("device-a"),
    brandSessionId("session-a"),
    brandHostedProfileId("profile-a"),
  );
  const b = routeScope(
    human,
    brandDeviceId("device-b"),
    brandSessionId("session-b"),
    brandHostedProfileId("profile-b"),
  );

  assert.equal(
    collectionOwnerKey(ownerScopeFromRoute(a), collection),
    collectionOwnerKey(owner, collection),
  );
  assert.equal(
    collectionOwnerKey(ownerScopeFromRoute(b), collection),
    collectionOwnerKey(owner, collection),
  );
});

test("room and collection ownership records contain owner objects, not route/session identity", () => {
  const owner = ownerScope(brandHumanUserId("human-a"));
  assert.deepEqual(
    roomOwnership(owner, brandRoomId("room-a")),
    { owner, roomId: "room-a" },
  );
  assert.deepEqual(
    collectionOwnership(owner, brandCollectionId("collection-a")),
    { owner, collectionId: "collection-a" },
  );
});

test("ProfileAlias cannot populate RouteScope.profileId", () => {
  const alias = brandProfileAlias("default");

  const invalidRoute = routeScope(
    brandHumanUserId("human-a"),
    brandDeviceId("device-a"),
    brandSessionId("session-a"),
    // @ts-expect-error RouteScope requires opaque HostedProfileId, not local alias
    alias,
  );
  void invalidRoute;
});

test("owner-derived keys resist component-boundary punctuation collisions", () => {
  const a = ownerScope(brandHumanUserId("human.a"));
  const b = ownerScope(brandHumanUserId("human"));

  assert.notEqual(
    roomOwnerKey(a, brandRoomId("room")),
    roomOwnerKey(b, brandRoomId(".aroom")),
  );
  assert.notEqual(
    collectionOwnerKey(a, brandCollectionId("collection")),
    collectionOwnerKey(b, brandCollectionId(".acollection")),
  );
});

test("owner and product namespaces remain distinct for equal raw values", () => {
  const owner = ownerScope(brandHumanUserId("same"));
  assert.notEqual(ownerScopeKey(owner), roomOwnerKey(owner, brandRoomId("same")));
  assert.notEqual(
    ownerScopeKey(owner),
    collectionOwnerKey(owner, brandCollectionId("same")),
  );
});

test("route key encoding resists delimiter collisions", () => {
  const left = routeScope(
    brandHumanUserId("a.b"),
    brandDeviceId("c"),
    brandSessionId("d"),
    brandHostedProfileId("e"),
  );
  const right = routeScope(
    brandHumanUserId("a"),
    brandDeviceId("b.c"),
    brandSessionId("d"),
    brandHostedProfileId("e"),
  );

  assert.notEqual(routeScopeKey(left), routeScopeKey(right));
});

test("route key encoding resists punctuation and control-character collisions", () => {
  const left = routeScope(
    brandHumanUserId("human,/:\n\u0000"),
    brandDeviceId("device:%"),
    brandSessionId("session/.."),
    brandHostedProfileId("profile|x"),
  );
  const right = routeScope(
    brandHumanUserId("human"),
    brandDeviceId(",/:\n\u0000device:%"),
    brandSessionId("session/.."),
    brandHostedProfileId("profile|x"),
  );

  assert.notEqual(routeScopeKey(left), routeScopeKey(right));
});

test("route key encoding rejects lone high surrogates instead of normalizing them", () => {
  const make = (human: string) =>
    ownerScopeKey(ownerScope(brandHumanUserId(human)));

  assert.throws(() => make("\uD800"), /ill-formed Unicode/);
  assert.throws(() => make("\uD801"), /ill-formed Unicode/);
});

test("route key encoding distinguishes replacement character from malformed surrogate input", () => {
  const replacement = ownerScopeKey(
    ownerScope(brandHumanUserId("\uFFFD")),
  );

  assert.equal(typeof replacement, "string");
  assert.throws(
    () =>
      ownerScopeKey(
        ownerScope(brandHumanUserId("\uD800")),
      ),
    /ill-formed Unicode/,
  );
});

test("route key encoding accepts valid surrogate pairs", () => {
  const emoji = ownerScopeKey(
    ownerScope(brandHumanUserId("human-😀")),
  );
  assert.equal(typeof emoji, "string");
});

test("route key encoding is stable for Unicode ids", () => {
  const route = routeScope(
    brandHumanUserId("用户甲"),
    brandDeviceId("设备📱"),
    brandSessionId("会话一"),
    brandHostedProfileId("资料🌙"),
  );

  assert.equal(routeScopeKey(route), routeScopeKey(route));
});

test("owner, room, collection and route namespaces cannot collide", () => {
  const owner = ownerScope(brandHumanUserId("same"));
  const route = routeScope(
    brandHumanUserId("same"),
    brandDeviceId(""),
    brandSessionId(""),
    brandHostedProfileId(""),
  );

  const keys = new Set([
    ownerScopeKey(owner),
    roomOwnerKey(owner, brandRoomId("same")),
    collectionOwnerKey(owner, brandCollectionId("same")),
    routeScopeKey(route),
  ]);

  assert.equal(keys.size, 4);
});

test("canonical keys do not embed local profile aliases", () => {
  const alias = brandProfileAlias("default");
  const route = routeScope(
    brandHumanUserId("human-a"),
    brandDeviceId("device-a"),
    brandSessionId("session-a"),
    brandHostedProfileId("opaque-profile-a"),
  );

  const key = routeScopeKey(route);
  assert.equal(alias, "default");
  assert.equal(key.includes("default"), false);
});

test("canonical keys do not expose raw route ids", () => {
  const route = routeScope(
    brandHumanUserId("raw-human"),
    brandDeviceId("raw-device"),
    brandSessionId("raw-session"),
    brandHostedProfileId("raw-profile"),
  );

  const key = routeScopeKey(route);
  for (const raw of ["raw-human", "raw-device", "raw-session", "raw-profile"]) {
    assert.equal(key.includes(raw), false);
  }
});

test("agent route adds actor identity without changing the underlying route key", () => {
  const route = routeScope(
    brandHumanUserId("human-a"),
    brandDeviceId("device-a"),
    brandSessionId("session-a"),
    brandHostedProfileId("profile-a"),
  );
  const agentRoute = agentRouteScope(route, brandAgentIdentity("gpt"));

  assert.equal(routeScopeKey(agentRoute), routeScopeKey(route));
  assert.equal(agentRoute.agentIdentity, "gpt");
});
