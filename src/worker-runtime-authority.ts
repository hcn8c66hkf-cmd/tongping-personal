import type { DeviceId, HumanUserId, SessionId } from "./route-identity.js";

export interface VerifiedWorkerConnectionContext {
  readonly humanUserId: HumanUserId;
  readonly deviceId: DeviceId;
  readonly sessionId: SessionId;
}

export interface VerifiedWorkerDeviceBinding {
  readonly humanUserId: HumanUserId;
  readonly deviceId: DeviceId;
  readonly credentialVersion: number;
}

/**
 * Durable device credential authority consulted only at service-session
 * boundaries. The Registry must not turn this into a per-frame database read.
 */
export interface WorkerDeviceAuthorityStore {
  verifyDeviceCredential(
    deviceId: string,
    credential: string,
  ): Promise<VerifiedWorkerDeviceBinding | null>;
}

export interface WorkerSessionMetadata {
  readonly workerVersion: string | null;
  readonly clientCapabilities: Readonly<Record<string, unknown>> | null;
}

/** Durable session metadata journal; no transient session credential crosses it. */
export interface WorkerSessionJournal {
  recordSessionStart(
    context: VerifiedWorkerConnectionContext,
    metadata: WorkerSessionMetadata,
  ): Promise<void>;

  recordSessionEnd(
    context: VerifiedWorkerConnectionContext,
    reason: string,
  ): Promise<void>;
}

export const NOOP_WORKER_SESSION_JOURNAL: WorkerSessionJournal = {
  async recordSessionStart() {},
  async recordSessionEnd() {},
};
