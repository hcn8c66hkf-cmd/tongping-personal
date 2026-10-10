import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DelayedCompanionHls } from "../src/delayed-companion-hls.js";

test("media start paused during cleanup cannot install a retired Worker stream", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-e-hls-"));
  const hls = new DelayedCompanionHls(root);
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => { entered = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  hls.stop = async () => { entered(); await blocked; };
  let current = true;
  try {
    const starting = hls.start("default", "old-stream", "video/webm", null, async () => current);
    await reached;
    current = false;
    release();
    await starting;
    assert.equal((hls.status() as { sessions: Array<{ streamId: string }> }).sessions.length, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
