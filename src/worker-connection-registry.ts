import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { BrowserAction, BrowserReply } from "./browser-service.js";
import type { HumanBrowserAction } from "./gateway.js";
import { brandSessionId, type DeviceId, type HumanUserId } from "./route-identity.js";
import { RemoteWorkerRelay, type WorkerCommand } from "./worker-relay.js";
import {
  NOOP_WORKER_SESSION_JOURNAL,
  type VerifiedWorkerConnectionContext,
  type WorkerDeviceAuthorityStore,
  type WorkerSessionJournal,
  type WorkerSessionMetadata,
} from "./worker-runtime-authority.js";

export type { VerifiedWorkerConnectionContext } from "./worker-runtime-authority.js";

const SESSION_TTL_MS = 12 * 60 * 60_000;
const SESSION_SECRET = /^[A-Za-z0-9_-]{43}$/;

export interface OpenWorkerSession {
  readonly context: VerifiedWorkerConnectionContext;
  readonly sessionCredential: string;
  readonly expiresAt: number;
}

export interface WorkerConnectionHandle {
  readonly context: VerifiedWorkerConnectionContext;
  isCurrent(): Promise<boolean>;
  /** Read-only exact-generation observer for a synchronous consumer commit fence. */
  isCurrentNow?(): boolean;
  call(
    action: BrowserAction,
    args: Record<string, unknown>,
    client?: string,
  ): Promise<BrowserReply>;
  human(
    action: HumanBrowserAction,
    args: Record<string, unknown>,
    client?: string,
  ): Promise<BrowserReply>;
  nextCommand(waitMs?: number): Promise<WorkerCommand | null>;
  complete(id: string, reply: BrowserReply): Promise<boolean>;
  registerRetirementResource(
    close: () => void | Promise<void>,
  ): Promise<void>;
}

export class WorkerSessionRejected extends Error {
  constructor() {
    super("Worker service session rejected");
  }
}

export interface WorkerConnectionRegistryOptions {
  /** Deterministic test/diagnostic seam, called after a trusted command enters its generation relay. */
  onEnqueued?: (context: VerifiedWorkerConnectionContext) => void;
  /** Durable metadata seam. Private mode keeps the no-op journal. */
  sessionJournal?: WorkerSessionJournal;
  /** Cleanup diagnostics cannot restore authority or change revoke success. */
  onRetirementCleanupError?: (
    error: unknown,
    context: VerifiedWorkerConnectionContext,
  ) => void;
}

interface PrivateCompatibleRevoker {
  revokeDevice(deviceId: string): Promise<boolean>;
}

class WorkerConnection {
  readonly relay = new RemoteWorkerRelay(35_000, true);
  readonly resources: Array<() => void | Promise<void>> = [];
  active = true;
  retirementReason: string | null = null;

  constructor(
    readonly context: VerifiedWorkerConnectionContext,
    readonly credentialDigest: string,
    readonly expiresAt: number,
  ) {}

  detachAuthority(
    reason: string,
  ): Array<() => void | Promise<void>> {
    if (!this.active) return [];
    this.active = false;
    this.retirementReason = reason;
    this.relay.retire();
    return this.resources.splice(0);
  }

  async retire(reason: string): Promise<void> {
    const closures = this.detachAuthority(reason);
    const results = await Promise.allSettled(
      closures.map((close) => Promise.resolve().then(close)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}

/**
 * Transient authority. The daemon owns exactly one instance.
 *
 * Durable device/session checks happen only at open/revoke boundaries. Once a
 * generation is installed, per-frame/per-message currentness is in-memory.
 */
export class WorkerConnectionRegistry {
  private readonly current = new Map<DeviceId, WorkerConnection>();
  private readonly credentials = new Map<string, WorkerConnection>();
  private readonly sessionJournal: WorkerSessionJournal;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly deviceAuthority: WorkerDeviceAuthorityStore,
    private readonly now: () => number = Date.now,
    private readonly options: WorkerConnectionRegistryOptions = {},
  ) {
    this.sessionJournal =
      options.sessionJournal ?? NOOP_WORKER_SESSION_JOURNAL;
  }

  async openSession(
    deviceId: string,
    deviceCredential: string,
    metadata: WorkerSessionMetadata = {
      workerVersion: null,
      clientCapabilities: null,
    },
  ): Promise<OpenWorkerSession> {
    return this.serialize(async () => {
      const binding =
        await this.deviceAuthority.verifyDeviceCredential(
          deviceId,
          deviceCredential,
        );
      if (!binding) throw new WorkerSessionRejected();

      const context = Object.freeze({
        humanUserId: binding.humanUserId,
        deviceId: binding.deviceId,
        sessionId: brandSessionId(randomUUID()),
      });
      const sessionCredential = randomBytes(32).toString("base64url");
      const candidate = new WorkerConnection(
        context,
        digest(sessionCredential),
        this.now() + SESSION_TTL_MS,
      );

      const old = this.current.get(binding.deviceId);
      if (old) {
        // Old authority/token disappears before transport cleanup or any DB
        // journal work for the replacement.
        this.current.delete(binding.deviceId);
        this.credentials.delete(old.credentialDigest);
        await old.retire("replaced");
      }

      // A revoke committed during old-generation cleanup must stop here.
      const stillBound =
        await this.deviceAuthority.verifyDeviceCredential(
          deviceId,
          deviceCredential,
        );
      if (
        !stillBound ||
        stillBound.humanUserId !== context.humanUserId ||
        stillBound.deviceId !== context.deviceId
      ) {
        throw new WorkerSessionRejected();
      }

      // Hosted journals recheck active owner/device inside their transaction.
      // Failure here leaves the old generation retired and never installs the
      // candidate.
      await this.sessionJournal.recordSessionStart(context, metadata);

      this.current.set(binding.deviceId, candidate);
      this.credentials.set(candidate.credentialDigest, candidate);
      return {
        context,
        sessionCredential,
        expiresAt: candidate.expiresAt,
      };
    });
  }

  async authenticateWorkerSession(
    sessionCredential: string,
  ): Promise<WorkerConnectionHandle | null> {
    if (!SESSION_SECRET.test(sessionCredential)) return null;
    const connection = this.credentials.get(digest(sessionCredential));
    if (!connection || !(await this.isCurrentConnection(connection))) {
      return null;
    }
    return this.handle(connection);
  }

  async resolveActiveConnection(
    humanUserId: HumanUserId,
    deviceId: DeviceId,
  ): Promise<WorkerConnectionHandle | null> {
    const connection = this.current.get(deviceId);
    if (
      !connection ||
      connection.context.humanUserId !== humanUserId ||
      !(await this.isCurrentConnection(connection))
    ) {
      return null;
    }
    return this.handle(connection);
  }

  /** Private-single-user bridge: an alias cannot choose among multiple Worker devices. */
  async resolveUniqueActiveConnection(
    humanUserId: HumanUserId,
  ): Promise<WorkerConnectionHandle | null> {
    const matching = () =>
      [...this.current.values()].filter(
        (connection) =>
          connection.context.humanUserId === humanUserId &&
          connection.active &&
          connection.expiresAt > this.now(),
      );
    const candidates = matching();
    if (
      candidates.length !== 1 ||
      !(await this.isCurrentConnection(candidates[0]!))
    ) {
      return null;
    }
    const stillMatching = matching();
    if (
      stillMatching.length !== 1 ||
      stillMatching[0] !== candidates[0]
    ) {
      return null;
    }
    return this.handle(candidates[0]!);
  }

  async dispatchTrusted(
    humanUserId: HumanUserId,
    deviceId: DeviceId,
    action: BrowserAction,
    args: Record<string, unknown>,
    client?: string,
  ): Promise<BrowserReply> {
    const target =
      await this.resolveActiveConnection(humanUserId, deviceId);
    return target
      ? target.call(action, args, client)
      : { ok: false, error: "no_target" };
  }

  /**
   * Hosted revoke seam. The Registry serializes the durable commit with
   * session replacement without knowing which durable store is underneath.
   */
  async revokeDeviceAuthority(
    humanUserId: HumanUserId,
    deviceId: DeviceId,
    durableRevoke: () => Promise<boolean>,
    outcomeMayHaveCommitted: (error: unknown) => boolean = () => false,
  ): Promise<boolean> {
    return this.serialize(async () => {
      let revoked: boolean;
      try {
        revoked = await durableRevoke();
      } catch (error) {
        if (outcomeMayHaveCommitted(error)) {
          // The durable revoke may already exist. Keeping transient authority
          // would risk authorizing a device that PostgreSQL has revoked.
          this.detachHostedDeviceAuthority(
            humanUserId,
            deviceId,
            "revoke-outcome-unknown",
          );
        }
        throw error;
      }
      if (!revoked) return false;
      this.detachHostedDeviceAuthority(
        humanUserId,
        deviceId,
        "revoked",
      );
      return true;
    });
  }

  /**
   * Existing private compatibility API. Hosted code must use
   * revokeDeviceAuthority with an owner-bound durable callback.
   */
  async revokeDevice(deviceId: string): Promise<boolean> {
    const revoker = this.deviceAuthority as WorkerDeviceAuthorityStore &
      Partial<PrivateCompatibleRevoker>;
    if (typeof revoker.revokeDevice !== "function") {
      throw new WorkerSessionRejected();
    }

    return this.serialize(async () => {
      const revoked = await revoker.revokeDevice!(deviceId);
      if (!revoked) return false;
      const old = this.current.get(deviceId as DeviceId);
      if (old) {
        this.current.delete(old.context.deviceId);
        this.credentials.delete(old.credentialDigest);
        await old.retire("revoked");
      }
      return true;
    });
  }

  private detachHostedDeviceAuthority(
    humanUserId: HumanUserId,
    deviceId: DeviceId,
    reason: string,
  ): boolean {
    const old = this.current.get(deviceId);
    if (!old || old.context.humanUserId !== humanUserId) return false;

    // Authority maps and relay are synchronously invalidated after durable DB
    // commit. Resource/socket cleanup is deliberately asynchronous.
    this.current.delete(deviceId);
    this.credentials.delete(old.credentialDigest);
    const closures = old.detachAuthority(reason);
    void Promise.allSettled(
      closures.map((close) => Promise.resolve().then(close)),
    ).then((results) => {
      for (const result of results) {
        if (result.status !== "rejected") continue;
        try {
          this.options.onRetirementCleanupError?.(
            result.reason,
            old.context,
          );
        } catch {
          // Diagnostics cannot restore authority.
        }
      }
    });
    return true;
  }

  private async isCurrentConnection(
    connection: WorkerConnection,
  ): Promise<boolean> {
    return (
      connection.active &&
      this.current.get(connection.context.deviceId) === connection &&
      connection.expiresAt > this.now()
    );
  }

  private handle(
    connection: WorkerConnection,
  ): WorkerConnectionHandle {
    const valid = () => this.isCurrentConnection(connection);
    const rejected = (): BrowserReply => ({
      ok: false,
      error: "cancelled",
    });
    return Object.freeze({
      context: connection.context,
      isCurrent: valid,
      isCurrentNow: () => (
        connection.active &&
        this.current.get(connection.context.deviceId) === connection &&
        connection.expiresAt > this.now()
      ),
      call: async (
        action: BrowserAction,
        args: Record<string, unknown>,
        client?: string,
      ) => {
        if (!(await valid()) || !connection.active) return rejected();
        const pending = connection.relay.call(action, args, client);
        if (connection.active) {
          try {
            this.options.onEnqueued?.(connection.context);
          } catch {
            // Diagnostics cannot change dispatch outcome.
          }
        }
        return pending;
      },
      human: async (
        action: HumanBrowserAction,
        args: Record<string, unknown>,
        client?: string,
      ) => {
        if (!(await valid()) || !connection.active) return rejected();
        const pending = connection.relay.human(action, args, client);
        if (connection.active) {
          try {
            this.options.onEnqueued?.(connection.context);
          } catch {
            // Diagnostics cannot change dispatch outcome.
          }
        }
        return pending;
      },
      nextCommand: async (waitMs?: number) => {
        if (!(await valid())) return null;
        const command = await connection.relay.nextCommand(waitMs);
        return command && (await valid()) ? command : null;
      },
      complete: async (id: string, reply: BrowserReply) =>
        (await valid()) && connection.relay.complete(id, reply),
      registerRetirementResource: async (
        close: () => void | Promise<void>,
      ) => {
        if (
          (await valid()) &&
          connection.active &&
          connection.expiresAt > this.now() &&
          this.current.get(connection.context.deviceId) === connection
        ) {
          connection.resources.push(close);
        } else {
          await close();
        }
      },
    });
  }

  private serialize<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function digest(credential: string): string {
  return createHash("sha256")
    .update("tongping-worker-service-session-v1\0")
    .update(credential)
    .digest("hex");
}
