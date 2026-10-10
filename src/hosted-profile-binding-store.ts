import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { brandHostedProfileId, routeScope, type HostedProfileId, type RouteScope } from "./route-identity.js";
import type { VerifiedWorkerConnectionContext, WorkerConnectionHandle } from "./worker-connection-registry.js";
import { isCanonicalProfileAlias } from "./profile-alias.js";

const STATE_FILE = "worker-profile-bindings-v1.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Binding {
  humanUserId: string;
  deviceId: string;
  alias: string;
  profileId: string;
}
interface State { version: 1; bindings: Record<string, Binding> }

/** The daemon owns one instance under its process lock. Session IDs are never persisted here. */
export class HostedProfileBindingStore {
  private readonly file: string;
  private initialized = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(homeDir: string, private readonly beforePublish?: () => Promise<void>) {
    this.file = path.join(homeDir, STATE_FILE);
  }

  resolveHostedProfile(context: VerifiedWorkerConnectionContext, alias: string): Promise<HostedProfileId> {
    if (!isCanonicalProfileAlias(alias)) throw new Error("Invalid local profile alias");
    if (!context.humanUserId || !context.deviceId) throw new Error("Invalid verified Worker context");
    const pending = this.tail.then(async () => {
      const state = await this.read();
      const key = bindingKey(context.humanUserId, context.deviceId, alias);
      const existing = Object.prototype.hasOwnProperty.call(state.bindings, key) ? state.bindings[key] : undefined;
      if (existing) return brandHostedProfileId(existing.profileId);
      const used = new Set(Object.values(state.bindings).map((entry) => entry.profileId));
      let profileId: string;
      do { profileId = randomUUID(); } while (used.has(profileId));
      state.bindings[key] = { humanUserId: context.humanUserId, deviceId: context.deviceId, alias, profileId };
      await this.publish(state);
      return brandHostedProfileId(profileId);
    });
    this.tail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private async read(): Promise<State> {
    let raw: string;
    try { raw = await fs.readFile(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (this.initialized) throw new Error("Hosted profile binding state disappeared");
        return { version: 1, bindings: Object.create(null) };
      }
      throw error;
    }
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error("Invalid hosted profile binding state"); }
    if (!record(value) || value.version !== 1 || !record(value.bindings)) throw new Error("Invalid hosted profile binding state");
    const seen = new Set<string>();
    for (const [key, entry] of Object.entries(value.bindings)) {
      if (!record(entry) || typeof entry.humanUserId !== "string" || !entry.humanUserId ||
        typeof entry.deviceId !== "string" || !entry.deviceId ||
        typeof entry.alias !== "string" || !isCanonicalProfileAlias(entry.alias) ||
        typeof entry.profileId !== "string" || !UUID.test(entry.profileId) ||
        key !== bindingKey(entry.humanUserId, entry.deviceId, entry.alias) || seen.has(entry.profileId)) {
        throw new Error("Invalid hosted profile binding state");
      }
      seen.add(entry.profileId);
    }
    this.initialized = true;
    return value as unknown as State;
  }

  private async publish(state: State): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = path.join(path.dirname(this.file), `.${STATE_FILE}.${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(state) + "\n"); await handle.sync(); }
      finally { await handle.close(); }
      await this.beforePublish?.();
      await fs.rename(temporary, this.file);
      this.initialized = true;
    } finally { await fs.rm(temporary, { force: true }); }
  }
}

export async function resolveVerifiedRoute(
  handle: WorkerConnectionHandle,
  alias: string,
  bindings: HostedProfileBindingStore,
): Promise<RouteScope | null> {
  if (!(await handle.isCurrent())) return null;
  const profileId = await bindings.resolveHostedProfile(handle.context, alias);
  if (!(await handle.isCurrent())) return null;
  return Object.freeze(routeScope(handle.context.humanUserId, handle.context.deviceId, handle.context.sessionId, profileId));
}

function bindingKey(humanUserId: string, deviceId: string, alias: string): string {
  return JSON.stringify([humanUserId, deviceId, alias]);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
