import { Buffer } from "node:buffer";

import type {
  CollectionId,
  OwnerScope,
  RoomId,
  RouteScope,
} from "./route-identity.js";

const KEY_VERSION = "rk1";

type KeyNamespace =
  | "owner"
  | "route"
  | "room-owner"
  | "collection-owner";

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("Route key component contains ill-formed Unicode.");
      }
      index += 1;
      continue;
    }

    if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("Route key component contains ill-formed Unicode.");
    }
  }
}

function encodeComponent(value: string): string {
  assertWellFormedUnicode(value);
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * Canonical namespace encoding used by M1 shared-server keys.
 *
 * Base64url components contain no "." delimiter, so component boundaries are
 * unambiguous even when IDs contain punctuation, control characters or
 * Unicode. Callers receive an opaque key and should never parse it back into
 * authority.
 */
function canonicalKey(namespace: KeyNamespace, parts: readonly string[]): string {
  return [
    KEY_VERSION,
    encodeComponent(namespace),
    String(parts.length),
    ...parts.map(encodeComponent),
  ].join(".");
}

export function ownerScopeKey(scope: OwnerScope): string {
  return canonicalKey("owner", [scope.humanUserId]);
}

export function routeScopeKey(scope: RouteScope): string {
  return canonicalKey("route", [
    scope.humanUserId,
    scope.deviceId,
    scope.sessionId,
    scope.profileId,
  ]);
}

export function roomOwnerKey(owner: OwnerScope, roomId: RoomId): string {
  return canonicalKey("room-owner", [owner.humanUserId, roomId]);
}

export function collectionOwnerKey(
  owner: OwnerScope,
  collectionId: CollectionId,
): string {
  return canonicalKey("collection-owner", [
    owner.humanUserId,
    collectionId,
  ]);
}
