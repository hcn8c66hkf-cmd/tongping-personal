import fs from "node:fs/promises";
import path from "node:path";

export interface DaemonLock {
  release(): Promise<void>;
}

export async function acquireDaemonLock(homeDir: string): Promise<DaemonLock> {
  await fs.mkdir(homeDir, { recursive: true });
  const lockPath = path.join(homeDir, "daemon.lock");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }) + "\n",
        "utf8",
      );
      await handle.close();

      return {
        async release() {
          await fs.unlink(lockPath).catch(() => undefined);
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const stale = await isStale(lockPath);
      if (!stale || attempt > 0) {
        throw new Error(
          `tongping daemon lock already exists at ${lockPath}. Stop the existing daemon before starting another one.`,
        );
      }
      await fs.unlink(lockPath).catch(() => undefined);
    }
  }

  throw new Error("Unable to acquire daemon lock.");
}

async function isStale(lockPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as { pid?: unknown };
    if (typeof parsed.pid !== "number") return true;

    try {
      process.kill(parsed.pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ESRCH";
    }
  } catch {
    return true;
  }
}
