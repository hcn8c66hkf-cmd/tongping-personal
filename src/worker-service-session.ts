import { brandSessionId, type SessionId } from "./route-identity.js";
import { loadOrCreateWorkerDeviceId } from "./worker-device-identity.js";
import { createWorkerDeviceCredentialStore, type WorkerDeviceCredentialStore } from "./worker-device-credential.js";

export interface WorkerServiceSession {
  readonly sessionId: SessionId;
  readonly sessionCredential: string;
  readonly expiresAt: number;
}

/** Opens a transient session only; the legacy poll and WebSocket loops do not use it in R0-D. */
export async function openWorkerServiceSession(
  homeDir: string,
  cloudUrl: string,
  credentialStore: WorkerDeviceCredentialStore = createWorkerDeviceCredentialStore(homeDir),
  request: typeof fetch = fetch,
): Promise<WorkerServiceSession> {
  const deviceId = await loadOrCreateWorkerDeviceId(homeDir);
  const protectedCredential = await credentialStore.load();
  if (!protectedCredential) throw new Error("Protected Worker device credential required");
  const deviceCredential = Buffer.from(protectedCredential).toString("utf8");
  if (!/^[A-Za-z0-9_-]{43}$/.test(deviceCredential)) throw new Error("Invalid protected Worker device credential");
  const response = await request(cloudUrl.replace(/\/+$/, "") + "/v1/worker/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, device_credential: deviceCredential }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Worker service session rejected: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid Worker service session response");
  const value = body as Record<string, unknown>;
  if (value.ok !== true || value.device_id !== deviceId ||
    typeof value.session_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.session_id) ||
    typeof value.session_credential !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.session_credential) ||
    !Number.isSafeInteger(value.expires_at) || (value.expires_at as number) <= Date.now()) {
    throw new Error("Invalid Worker service session response");
  }
  return Object.freeze({
    sessionId: brandSessionId(value.session_id),
    sessionCredential: value.session_credential,
    expiresAt: value.expires_at as number,
  });
}
