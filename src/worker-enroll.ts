import { loadConfig } from "./config.js";
import { pathToFileURL } from "node:url";
import { loadOrCreateWorkerDeviceId } from "./worker-device-identity.js";
import { createWorkerDeviceCredentialStore, type WorkerDeviceCredentialStore } from "./worker-device-credential.js";

export class WorkerEnrollmentRecoveryRequired extends Error {
  constructor() { super("Trusted enrollment committed, but protected credential save failed; explicit recovery required"); }
}

/** Dedicated enrollment flow. Legacy Worker transport remains on its existing token. */
export async function enrollWorker(
  homeDir: string,
  cloudUrl: string,
  challenge: string,
  credentialStore: WorkerDeviceCredentialStore = createWorkerDeviceCredentialStore(homeDir),
  request: typeof fetch = fetch,
  name?: string,
): Promise<void> {
  const deviceId = await loadOrCreateWorkerDeviceId(homeDir);
  const existing = await credentialStore.load();
  if (existing) throw new Error("Worker already has a protected device credential; explicit recovery required");
  const response = await request(cloudUrl.replace(/\/+$/, "") + "/v1/worker/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(name ? { challenge, device_id: deviceId, name } : { challenge, device_id: deviceId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Trusted enrollment rejected: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid trusted enrollment response");
  const result = body as Record<string, unknown>;
  if (result.ok !== true || result.device_id !== deviceId || result.credential_version !== 1 ||
    typeof result.credential !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.credential)) {
    throw new Error("Invalid trusted enrollment response; explicit recovery may be required");
  }
  try { await credentialStore.save(Buffer.from(result.credential, "utf8")); }
  catch { throw new WorkerEnrollmentRecoveryRequired(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const cloudUrl = process.env.TONGPING_CLOUD_URL?.trim();
  const challenge = process.env.TONGPING_ENROLL_CHALLENGE?.trim();
  if (!cloudUrl || !challenge) throw new Error("TONGPING_CLOUD_URL and TONGPING_ENROLL_CHALLENGE are required");
  await enrollWorker(
    config.homeDir,
    cloudUrl,
    challenge,
    undefined,
    fetch,
    process.env.TONGPING_WORKER_NAME?.trim() || undefined,
  );
  console.error("Worker trusted enrollment saved in protected credential store");
}
