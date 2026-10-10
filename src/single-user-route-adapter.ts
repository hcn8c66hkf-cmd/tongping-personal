import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  brandDeviceId,
  brandHostedProfileId,
  brandSessionId,
  routeScope,
  type DeviceId,
  type OwnerScope,
  type ProfileAlias,
  type RouteScope,
  type SessionId,
} from "./route-identity.js";
import {
  PRIVATE_COMPAT_HUMAN_USER_ID,
  PRIVATE_COMPAT_OWNER_SCOPE,
} from "./private-persistent-owner.js";

const DEVICE_FILE = "private-device-id";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface SingleUserRouteAdapterOptions {
  readonly mode: "private-single-user" | "hosted";
  readonly homeDir: string;
  /** Inject only in tests; ordinary runtime sessions generate a fresh value. */
  readonly sessionId?: SessionId;
}

export interface PrivateRouteResolution {
  readonly owner: OwnerScope;
  readonly route: RouteScope;
  readonly profileAlias: ProfileAlias;
}

export interface SingleUserRouteAdapter {
  resolve(profileAlias: ProfileAlias): PrivateRouteResolution;
}

/** The only entry point to private compatibility identity. Hosted/unknown modes fail before I/O. */
export async function createSingleUserRouteAdapter(
  options: SingleUserRouteAdapterOptions,
): Promise<SingleUserRouteAdapter> {
  if (options?.mode !== "private-single-user") {
    throw new Error("SingleUserRouteAdapter requires explicit private-single-user mode");
  }
  const deviceId = await loadOrCreatePrivateDeviceId(options.homeDir);
  const sessionId = options.sessionId ?? brandSessionId(randomUUID());

  return {
    resolve(profileAlias: ProfileAlias): PrivateRouteResolution {
      const profileId = privateProfileId(deviceId, profileAlias);
      return {
        owner: PRIVATE_COMPAT_OWNER_SCOPE,
        route: routeScope(PRIVATE_COMPAT_HUMAN_USER_ID, deviceId, sessionId, profileId),
        profileAlias,
      };
    },
  };
}

async function loadOrCreatePrivateDeviceId(homeDir: string): Promise<DeviceId> {
  await fs.mkdir(homeDir, { recursive: true });
  const target = path.join(homeDir, DEVICE_FILE);
  const existing = await readExistingDeviceId(target);
  if (existing) return existing;

  // Publish a fully written, private file via an exclusive hard link. An
  // EEXIST loser reads the winner; neither process can overwrite its ID.
  const temporary = path.join(homeDir, `.${DEVICE_FILE}.${randomUUID()}.tmp`);
  const candidate = randomUUID();
  try {
    await fs.writeFile(temporary, `${candidate}\n`, { flag: "wx", mode: 0o600 });
    try {
      await fs.link(temporary, target);
      return brandDeviceId(candidate);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      const winner = await readExistingDeviceId(target);
      if (!winner) throw new Error("Private device identity disappeared during initialization");
      return winner;
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readExistingDeviceId(file: string): Promise<DeviceId | undefined> {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
  if (!stat.isFile()) throw new Error(`Invalid private device identity state: ${file}`);
  const contents = await fs.readFile(file, "utf8");
  const id = contents.endsWith("\n") ? contents.slice(0, -1) : contents;
  if (!UUID_V4.test(id)) throw new Error(`Invalid private device identity state: ${file}`);
  return brandDeviceId(id);
}

function privateProfileId(deviceId: DeviceId, alias: ProfileAlias) {
  const hash = createHash("sha256");
  for (const part of ["tongping-private-profile-v1", deviceId, alias]) {
    // UTF-16LE retains exact JS code units, including unusual aliases.
    const bytes = Buffer.from(part, "utf16le");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    hash.update(length).update(bytes);
  }
  return brandHostedProfileId(`private-profile-v1:${hash.digest("hex")}`);
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
