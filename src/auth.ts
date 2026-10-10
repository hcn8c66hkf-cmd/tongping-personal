import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const TOKEN_FILE = "daemon-token";

export async function loadOrCreateDaemonToken(homeDir: string): Promise<string> {
  const fromEnv = process.env.TONGPING_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const tokenPath = path.join(homeDir, TOKEN_FILE);
  try {
    const existing = (await fs.readFile(tokenPath, "utf8")).trim();
    if (existing) return existing;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  await fs.mkdir(homeDir, { recursive: true });
  const token = crypto.randomBytes(32).toString("base64url");
  await fs.writeFile(tokenPath, token + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  }).catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  });

  return (await fs.readFile(tokenPath, "utf8")).trim();
}

export async function loadDaemonToken(homeDir: string): Promise<string> {
  const fromEnv = process.env.TONGPING_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return (await fs.readFile(path.join(homeDir, TOKEN_FILE), "utf8")).trim();
}

export function bearerMatches(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expectedToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
