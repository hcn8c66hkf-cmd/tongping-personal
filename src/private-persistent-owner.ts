/**
 * M1-E private persistent ownership vocabulary.
 *
 * This is compatibility metadata for the current private single-user product.
 * It is NOT hosted authentication and does NOT prove multi-user isolation.
 *
 * Persistent ownership is rooted only in the synthetic private human owner.
 * Device/session/profile/alias remain routing/access context and never become
 * permanent product ownership.
 */

import {
  brandCollectionId,
  brandHumanUserId,
  brandRoomId,
  collectionOwnership,
  ownerScope,
  roomOwnership,
  type CollectionId,
  type CollectionOwnership,
} from "./route-identity.js";

export const PRIVATE_COMPAT_HUMAN_USER_ID = brandHumanUserId(
  "private-single-user-compat-v1",
);

export const PRIVATE_COMPAT_OWNER_SCOPE = ownerScope(
  PRIVATE_COMPAT_HUMAN_USER_ID,
);

/**
 * Logical identity for the one existing private group-chat room.
 *
 * The current RoomFile has no room-id field; M1-E deliberately does not
 * rewrite that persisted schema. This ID is the compatibility ownership
 * vocabulary for that existing room.
 */
export const PRIVATE_APP_CHAT_ROOM_ID = brandRoomId(
  "private-app-chat-room-v1",
);

export const PRIVATE_APP_CHAT_ROOM_OWNERSHIP = roomOwnership(
  PRIVATE_COMPAT_OWNER_SCOPE,
  PRIVATE_APP_CHAT_ROOM_ID,
);

/**
 * Existing physical collection id. Do not change this value in M1-E: current
 * private watch data already lives under this directory name.
 */
export const PRIVATE_WATCH_COLLECTION_ID = brandCollectionId(
  "tongping-owner-watch-collection",
);

export const PRIVATE_WATCH_COLLECTION_OWNERSHIP = collectionOwnership(
  PRIVATE_COMPAT_OWNER_SCOPE,
  PRIVATE_WATCH_COLLECTION_ID,
);

/**
 * Compatibility ownership view for any collection handled by the current
 * private store. This is metadata only; it does not add access control.
 */
export function privateCollectionOwnership(
  collectionId: CollectionId,
): CollectionOwnership {
  return collectionOwnership(PRIVATE_COMPAT_OWNER_SCOPE, collectionId);
}
