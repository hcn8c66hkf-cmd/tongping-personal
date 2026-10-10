import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const CREDENTIAL_FILE = "worker-device-credential";

export interface WorkerCredentialProtector {
  protect(plaintext: Uint8Array): Promise<Uint8Array>;
  unprotect(protectedBytes: Uint8Array): Promise<Uint8Array>;
}

export interface WorkerDeviceCredentialStore {
  load(): Promise<Uint8Array | null>;
  save(secret: Uint8Array): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The optional protector is an explicit test seam. Windows defaults to DPAPI
 * CurrentUser; other platforms (a Linux mini host) store the credential in an
 * owner-only 0600 file, the same protection the legacy worker token has.
 */
export function createWorkerDeviceCredentialStore(
  homeDir: string,
  protector: WorkerCredentialProtector = defaultProtector(),
): WorkerDeviceCredentialStore {
  const target = path.join(homeDir, CREDENTIAL_FILE);
  return {
    async load() {
      ensureSupported(protector);
      let stat;
      try {
        stat = await fs.lstat(target);
      } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 1024 * 1024) {
        throw new Error("Invalid protected Worker device credential state");
      }
      const plaintext = await protector.unprotect(await fs.readFile(target));
      if (plaintext.length === 0) throw new Error("Invalid protected Worker device credential state");
      return plaintext;
    },
    async save(secret) {
      ensureSupported(protector);
      if (secret.length === 0) throw new Error("Worker device credential must not be empty");
      // Existing corrupt state cannot be silently replaced by a new credential.
      await this.load();
      const protectedBytes = await protector.protect(secret);
      if (
        protectedBytes.length === 0 ||
        (protector !== posixFileProtector && Buffer.from(protectedBytes).includes(Buffer.from(secret)))
      ) {
        throw new Error("Worker device credential protection failed");
      }
      await fs.mkdir(homeDir, { recursive: true });
      const temporary = path.join(homeDir, `.${CREDENTIAL_FILE}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, protectedBytes, { flag: "wx", mode: 0o600 });
        await fs.rename(temporary, target);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    },
    async clear() {
      ensureSupported(protector);
      await fs.rm(target, { force: true });
    },
  };
}

function ensureSupported(protector: WorkerCredentialProtector): void {
  if (protector === windowsDpapiProtector && process.platform !== "win32") {
    throw new Error("Windows DPAPI protection is required for Worker device credentials");
  }
}

function defaultProtector(): WorkerCredentialProtector {
  return process.platform === "win32" ? windowsDpapiProtector : posixFileProtector;
}

/** Owner-only file storage for non-Windows hosts; the file itself is written 0600. */
const posixFileProtector: WorkerCredentialProtector = {
  async protect(plaintext) { return Uint8Array.from(plaintext); },
  async unprotect(protectedBytes) { return Uint8Array.from(protectedBytes); },
};

const windowsDpapiProtector: WorkerCredentialProtector = {
  protect(plaintext) { return dpapi("Protect", plaintext); },
  unprotect(protectedBytes) { return dpapi("Unprotect", protectedBytes); },
};

async function dpapi(operation: "Protect" | "Unprotect", input: Uint8Array): Promise<Uint8Array> {
  if (process.platform !== "win32") throw new Error("Windows DPAPI protection is required for Worker device credentials");
  // The command line contains code only. Secret bytes travel through stdin and stdout pipes.
  const script = `$ErrorActionPreference = 'Stop'; try { Add-Type -AssemblyName System.Security; $bytes = [Convert]::FromBase64String([Console]::In.ReadLine()); $result = [System.Security.Cryptography.ProtectedData]::${operation}($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result)) } catch { [Console]::Error.Write('DPAPI operation failed'); exit 1 }`;
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) child.kill();
      else chunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || size > 2 * 1024 * 1024) return reject(new Error("Windows DPAPI operation failed"));
      try { resolve(Buffer.from(Buffer.concat(chunks).toString("utf8").trim(), "base64")); }
      catch { reject(new Error("Windows DPAPI returned invalid output")); }
    });
    child.stdin.on("error", reject);
    child.stdin.end(Buffer.from(input).toString("base64") + "\n");
  });
}

function hasCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}
