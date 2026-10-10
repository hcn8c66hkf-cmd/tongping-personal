/**
 * Reusable M1 A/B fixtures for later adversarial tests.
 *
 * Test-only data. These fixtures are NOT authentication and do not establish
 * trusted runtime route provenance.
 */

import {
  brandDeviceId,
  brandHostedProfileId,
  brandHumanUserId,
  brandProfileAlias,
  brandSessionId,
  ownerScope,
  routeScope,
  type OwnerScope,
  type ProfileAlias,
  type RouteScope,
} from "../src/route-identity.js";

export interface PrivateMultiUserFixture {
  readonly owner: Readonly<OwnerScope>;
  readonly route: Readonly<RouteScope>;
  readonly profileAlias: ProfileAlias;
}

type FixedFixtureIdentity = {
  readonly humanUserId: string;
  readonly deviceId: string;
  readonly profileId: string;
  readonly profileAlias: string;
  readonly baseSessionId: string;
};

const A: FixedFixtureIdentity = Object.freeze({
  humanUserId: "human-a",
  deviceId: "device-a",
  profileId: "profile-a",
  profileAlias: "default",
  baseSessionId: "session-a",
});

const B: FixedFixtureIdentity = Object.freeze({
  humanUserId: "human-b",
  deviceId: "device-b",
  profileId: "profile-b",
  profileAlias: "default",
  baseSessionId: "session-b",
});

function build(
  fixed: FixedFixtureIdentity,
  sessionId: string,
): PrivateMultiUserFixture {
  const humanUserId = brandHumanUserId(fixed.humanUserId);
  const owner = Object.freeze(ownerScope(humanUserId));
  const route = Object.freeze(
    routeScope(
      humanUserId,
      brandDeviceId(fixed.deviceId),
      brandSessionId(sessionId),
      brandHostedProfileId(fixed.profileId),
    ),
  );

  return Object.freeze({
    owner,
    route,
    profileAlias: brandProfileAlias(fixed.profileAlias),
  });
}

export function fixtureA(): PrivateMultiUserFixture {
  return build(A, A.baseSessionId);
}

export function fixtureB(): PrivateMultiUserFixture {
  return build(B, B.baseSessionId);
}

export function fixtureAWithSession(
  sessionId: string,
): PrivateMultiUserFixture {
  return build(A, sessionId);
}

export function fixtureBWithSession(
  sessionId: string,
): PrivateMultiUserFixture {
  return build(B, sessionId);
}
