/**
 * M1-A route identity vocabulary.
 *
 * These brands prevent accidental mixing of identity classes. Branding a
 * string here does NOT authenticate it; trusted/authenticated construction is
 * introduced by later hosted boundaries. M1 only makes the distinctions
 * explicit so shared-server APIs cannot keep using bare strings.
 */

declare const routeIdentityBrand: unique symbol;

type BrandedId<Name extends string> = string & {
  readonly [routeIdentityBrand]: Name;
};

export type HumanUserId = BrandedId<"HumanUserId">;
export type DeviceId = BrandedId<"DeviceId">;
export type SessionId = BrandedId<"SessionId">;
export type HostedProfileId = BrandedId<"HostedProfileId">;
export type ProfileAlias = BrandedId<"ProfileAlias">;
export type AgentIdentity = BrandedId<"AgentIdentity">;
export type RoomId = BrandedId<"RoomId">;
export type CollectionId = BrandedId<"CollectionId">;

/**
 * Internal branding helpers only.
 *
 * They deliberately perform no authentication and must not be used as a
 * substitute for the hosted identity resolver introduced in later phases.
 */
export const brandHumanUserId = (value: string): HumanUserId =>
  value as HumanUserId;
export const brandDeviceId = (value: string): DeviceId => value as DeviceId;
export const brandSessionId = (value: string): SessionId => value as SessionId;
export const brandHostedProfileId = (value: string): HostedProfileId =>
  value as HostedProfileId;
export const brandProfileAlias = (value: string): ProfileAlias =>
  value as ProfileAlias;
export const brandAgentIdentity = (value: string): AgentIdentity =>
  value as AgentIdentity;
export const brandRoomId = (value: string): RoomId => value as RoomId;
export const brandCollectionId = (value: string): CollectionId =>
  value as CollectionId;

/**
 * Persistent product ownership root.
 *
 * Chat rooms / watch collections belong to the human owner. Device, session
 * and profile are access/routing context and must not become permanent owner
 * identity.
 */
export interface OwnerScope {
  readonly humanUserId: HumanUserId;
}

/**
 * Transient browser route used by shared-server routing.
 *
 * Local browser-facing names such as "default" are ProfileAlias values and
 * are intentionally absent from this hosted/global identity.
 */
export interface RouteScope {
  readonly humanUserId: HumanUserId;
  readonly deviceId: DeviceId;
  readonly sessionId: SessionId;
  readonly profileId: HostedProfileId;
}

export interface AgentRouteScope extends RouteScope {
  readonly agentIdentity: AgentIdentity;
}

export interface RoomOwnership {
  readonly owner: OwnerScope;
  readonly roomId: RoomId;
}

export interface CollectionOwnership {
  readonly owner: OwnerScope;
  readonly collectionId: CollectionId;
}

export function ownerScope(humanUserId: HumanUserId): OwnerScope {
  return { humanUserId };
}

export function routeScope(
  humanUserId: HumanUserId,
  deviceId: DeviceId,
  sessionId: SessionId,
  profileId: HostedProfileId,
): RouteScope {
  return { humanUserId, deviceId, sessionId, profileId };
}

export function agentRouteScope(
  route: RouteScope,
  agentIdentity: AgentIdentity,
): AgentRouteScope {
  return { ...route, agentIdentity };
}

export function ownerScopeFromRoute(route: RouteScope): OwnerScope {
  return ownerScope(route.humanUserId);
}

export function roomOwnership(
  owner: OwnerScope,
  roomId: RoomId,
): RoomOwnership {
  return { owner, roomId };
}

export function collectionOwnership(
  owner: OwnerScope,
  collectionId: CollectionId,
): CollectionOwnership {
  return { owner, collectionId };
}
