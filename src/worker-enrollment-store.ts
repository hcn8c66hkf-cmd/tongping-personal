import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { brandDeviceId, brandHumanUserId, type DeviceId, type HumanUserId } from "./route-identity.js";

const STATE_FILE = "worker-enrollment-state-v1.json";
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const CHALLENGE_TTL_MS = 5 * 60_000;

interface Challenge { humanUserId: string; expiresAt: number }
export interface DeviceBinding {
  deviceId: DeviceId;
  humanUserId: HumanUserId;
  credentialVersion: 1;
  credentialDigest: string;
  status: "active" | "revoked" | "disabled";
  createdAt: number;
  revokedAt: number | null;
}
interface State {
  version: 1;
  challenges: Record<string, Challenge>;
  bindings: Record<string, DeviceBinding>;
}

export class EnrollmentRejected extends Error {
  constructor(message = "Enrollment rejected") { super(message); }
}

export interface EnrollmentStoreOptions {
  now?: () => number;
  beforePublish?: () => Promise<void>;
}

/** One instance belongs to the daemon's existing single-process lock. All mutations serialize here. */
export class WorkerEnrollmentStore {
  private tail: Promise<void> = Promise.resolve();
  private initialized = false;
  private readonly file: string;
  private readonly now: () => number;
  private readonly beforePublish?: () => Promise<void>;

  constructor(homeDir: string, options: EnrollmentStoreOptions = {}) {
    this.file = path.join(homeDir, STATE_FILE);
    this.now = options.now ?? Date.now;
    this.beforePublish = options.beforePublish;
  }

  async issueChallenge(humanUserId: HumanUserId): Promise<{ challenge: string; expiresAt: number }> {
    if (!humanUserId) throw new EnrollmentRejected();
    return this.mutate(async (state) => {
      const challenge = randomBytes(32).toString("base64url");
      const expiresAt = this.now() + CHALLENGE_TTL_MS;
      state.challenges[hashChallenge(challenge)] = { humanUserId, expiresAt };
      await this.publish(state);
      return { challenge, expiresAt };
    });
  }

  async redeem(challenge: string, deviceId: string): Promise<{
    humanUserId: HumanUserId; deviceId: DeviceId; credentialVersion: 1; credential: string;
  }> {
    if (!SECRET.test(challenge) || !DEVICE_ID.test(deviceId)) throw new EnrollmentRejected();
    return this.mutate(async (state) => {
      const key = hashChallenge(challenge);
      const entry = own(state.challenges, key);
      if (!entry || entry.expiresAt <= this.now() || own(state.bindings, deviceId)) {
        throw new EnrollmentRejected();
      }
      const credential = randomBytes(32).toString("base64url");
      const binding: DeviceBinding = {
        deviceId: brandDeviceId(deviceId),
        humanUserId: brandHumanUserId(entry.humanUserId),
        credentialVersion: 1,
        credentialDigest: hashCredential(credential),
        status: "active",
        createdAt: this.now(),
        revokedAt: null,
      };
      state.bindings[deviceId] = binding;
      delete state.challenges[key];
      await this.publish(state);
      return { humanUserId: binding.humanUserId, deviceId: binding.deviceId, credentialVersion: 1, credential };
    });
  }

  async verifyDeviceCredential(deviceId: string, presentedCredential: string): Promise<{
    humanUserId: HumanUserId; deviceId: DeviceId; credentialVersion: 1;
  } | null> {
    if (!DEVICE_ID.test(deviceId) || !SECRET.test(presentedCredential)) return null;
    // Wait for queued commits before reading authority from disk.
    await this.tail;
    const binding = own((await this.read()).bindings, deviceId);
    if (!binding || binding.status !== "active") return null;
    const a = Buffer.from(hashCredential(presentedCredential), "hex");
    const b = Buffer.from(binding.credentialDigest, "hex");
    if (!timingSafeEqual(a, b)) return null;
    return { humanUserId: binding.humanUserId, deviceId: binding.deviceId, credentialVersion: 1 };
  }

  async revokeDevice(deviceId: string): Promise<boolean> {
    if (!DEVICE_ID.test(deviceId)) throw new EnrollmentRejected();
    return this.mutate(async (state) => {
      const binding = own(state.bindings, deviceId);
      if (!binding) return false;
      if (binding.status === "revoked") return true;
      binding.status = "revoked";
      binding.revokedAt = this.now();
      await this.publish(state);
      return true;
    });
  }

  async binding(deviceId: string): Promise<Readonly<DeviceBinding> | null> {
    await this.tail;
    const value = own((await this.read()).bindings, deviceId);
    return value ? { ...value } : null;
  }

  private mutate<T>(operation: (state: State) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => operation(await this.read()));
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async read(): Promise<State> {
    let raw: string;
    try { raw = await fs.readFile(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (this.initialized) throw new Error("Worker enrollment state disappeared");
        return { version: 1, challenges: Object.create(null), bindings: Object.create(null) };
      }
      throw error;
    }
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { throw new Error("Invalid Worker enrollment state"); }
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.challenges) || !isRecord(value.bindings)) {
      throw new Error("Invalid Worker enrollment state");
    }
    for (const [key, entry] of Object.entries(value.challenges)) {
      if (!DIGEST.test(key) || !isRecord(entry) || typeof entry.humanUserId !== "string" || !entry.humanUserId ||
        !Number.isSafeInteger(entry.expiresAt)) throw new Error("Invalid Worker enrollment state");
    }
    for (const [key, entry] of Object.entries(value.bindings)) {
      if (!DEVICE_ID.test(key) || !isRecord(entry) || entry.deviceId !== key ||
        typeof entry.humanUserId !== "string" || !entry.humanUserId || entry.credentialVersion !== 1 ||
        typeof entry.credentialDigest !== "string" || !DIGEST.test(entry.credentialDigest) ||
        !["active", "revoked", "disabled"].includes(String(entry.status)) ||
        !Number.isSafeInteger(entry.createdAt) ||
        !(entry.revokedAt === null || Number.isSafeInteger(entry.revokedAt))) {
        throw new Error("Invalid Worker enrollment state");
      }
    }
    this.initialized = true;
    return value as unknown as State;
  }

  private async publish(state: State): Promise<void> {
    const dir = path.dirname(this.file);
    await fs.mkdir(dir, { recursive: true });
    const temporary = path.join(dir, `.${STATE_FILE}.${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(state) + "\n"); await handle.sync(); }
      finally { await handle.close(); }
      await this.beforePublish?.();
      await fs.rename(temporary, this.file);
      this.initialized = true;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
}

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function hashChallenge(value: string): string {
  return createHash("sha256").update("tongping-worker-enrollment-challenge-v1\0").update(value).digest("hex");
}
function hashCredential(value: string): string {
  return createHash("sha256").update("tongping-worker-device-credential-v1\0").update(value).digest("hex");
}
