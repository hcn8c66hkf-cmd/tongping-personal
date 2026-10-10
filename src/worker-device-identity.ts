import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { brandDeviceId, type DeviceId } from "./route-identity.js";

const DEVICE_FILE = "worker-device-id";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Public installation identity. Its DeviceId brand does not authenticate a Worker. */
export async function loadOrCreateWorkerDeviceId(homeDir: string): Promise<DeviceId> {
  await fs.mkdir(homeDir, { recursive: true });
  const target = path.join(homeDir, DEVICE_FILE);
  const existing = await readDeviceId(target);
  if (existing) return existing;

  // A hard link publishes a fully written candidate only if no other startup won.
  const temporary = path.join(homeDir, `.${DEVICE_FILE}.${randomUUID()}.tmp`);
  const candidate = randomUUID();
  try {
    await fs.writeFile(temporary, `${candidate}\n`, { flag: "wx", mode: 0o600 });
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    const winner = await readDeviceId(target);
    if (!winner) throw new Error("Worker DeviceId disappeared during initialization");
    return winner;
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readDeviceId(file: string): Promise<DeviceId | null> {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64) {
    throw new Error("Invalid Worker DeviceId state");
  }
  const value = await fs.readFile(file, "utf8");
  const id = value.endsWith("\n") ? value.slice(0, -1) : value;
  if (!UUID_V4.test(id)) throw new Error("Invalid Worker DeviceId state");
  return brandDeviceId(id);
}

function hasCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}
