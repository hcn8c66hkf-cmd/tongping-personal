import type { CompanionFrameBuffer, CompanionFrameBufferStatus, CompanionFrameSelection } from "./companion-frame-buffer.js";
import { resolveVerifiedRoute, type HostedProfileBindingStore } from "./hosted-profile-binding-store.js";
import type { HumanUserId, RouteScope } from "./route-identity.js";
import type { WorkerConnectionRegistry } from "./worker-connection-registry.js";

/** Private-single-user read bridge. The local alias never selects a Worker device. */
export async function resolvePrivateTrustedCompanionRoute(
  registry: WorkerConnectionRegistry,
  bindings: HostedProfileBindingStore,
  owner: HumanUserId,
  alias: string,
): Promise<RouteScope | null> {
  const handle = await registry.resolveUniqueActiveConnection(owner);
  if (!handle) return null;
  const route = await resolveVerifiedRoute(handle, alias, bindings);
  if (!route) return null;
  const stillUnique = await registry.resolveUniqueActiveConnection(owner);
  if (!stillUnique || stillUnique.context.sessionId !== handle.context.sessionId ||
    stillUnique.context.deviceId !== handle.context.deviceId || !(await handle.isCurrent())) return null;
  return route;
}

export async function readPrivateTrustedCompanionFrame(
  registry: WorkerConnectionRegistry,
  bindings: HostedProfileBindingStore,
  owner: HumanUserId,
  buffer: CompanionFrameBuffer,
  alias: string,
  lookbackSeconds = 0,
): Promise<CompanionFrameSelection | null> {
  const route = await resolvePrivateTrustedCompanionRoute(registry, bindings, owner, alias);
  return route ? buffer.select(route, lookbackSeconds) : null;
}

export async function readPrivateTrustedCompanionFrameStatus(
  registry: WorkerConnectionRegistry,
  bindings: HostedProfileBindingStore,
  owner: HumanUserId,
  buffer: CompanionFrameBuffer,
  alias: string,
): Promise<CompanionFrameBufferStatus | null> {
  const route = await resolvePrivateTrustedCompanionRoute(registry, bindings, owner, alias);
  return route ? buffer.status(route) : null;
}
