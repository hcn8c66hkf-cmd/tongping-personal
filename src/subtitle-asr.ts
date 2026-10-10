import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Local speech-to-text for companion watching: a faster-whisper service in
// TONGPING_ASR_DIR (default ~/.tongping/asr; its own Python venv, GPU if
// available), installed by `npm run asr:install`. The worker only talks to it
// when it is installed; nothing leaves the PC.

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
}

export class LocalAsr {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<boolean> | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly waiting = new Map<string, (segments: AsrSegment[] | null) => void>();
  private readonly root =
    process.env.TONGPING_ASR_DIR?.trim() || path.join(os.homedir(), ".tongping", "asr");
  private readonly python = process.platform === "win32"
    ? path.join(this.root, ".venv", "Scripts", "python.exe")
    : path.join(this.root, ".venv", "bin", "python");
  private readonly script = path.join(this.root, "asr_server.py");
  private readonly tmp = path.join(os.tmpdir(), "tongping-asr");

  available(): boolean {
    return existsSync(this.python) && existsSync(this.script);
  }

  private start(): Promise<boolean> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await fs.mkdir(this.tmp, { recursive: true });
      const child = spawn(this.python, [this.script], {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
      });
      this.child = child;
      child.stdout.setEncoding("utf8");
      child.stderr.on("data", () => {});
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
        // First start may download and load the model.
        setTimeout(() => settle(false), 600_000).unref?.();
        child.stdout.on("data", (chunk: string) => {
          this.buffer += chunk;
          let at: number;
          while ((at = this.buffer.indexOf("\n")) >= 0) {
            const text = this.buffer.slice(0, at).trim();
            this.buffer = this.buffer.slice(at + 1);
            if (!text) continue;
            let message: any = null;
            try { message = JSON.parse(text); } catch { continue; }
            if (message && "ready" in message) { settle(message.ready === true); continue; }
            const done = message?.id ? this.waiting.get(String(message.id)) : undefined;
            if (!done) continue;
            this.waiting.delete(String(message.id));
            done(
              message.error || !Array.isArray(message.segments)
                ? null
                : message.segments.map((seg: any) => ({
                    start: Number(seg.start) || 0,
                    end: Number(seg.end) || 0,
                    text: String(seg.text ?? "").trim(),
                  })),
            );
          }
        });
        child.on("exit", () => {
          settle(false);
          this.child = null;
          this.ready = null;
          for (const done of this.waiting.values()) done(null);
          this.waiting.clear();
        });
        child.on("error", () => settle(false));
      });
    })();
    return this.ready;
  }

  async transcribe(wav: Buffer): Promise<AsrSegment[] | null> {
    if (!this.available()) return null;
    if (!(await this.start()) || !this.child) return null;
    const id = String(this.nextId++);
    const file = path.join(this.tmp, "clip-" + id + ".wav");
    await fs.writeFile(file, wav);
    const segments = await new Promise<AsrSegment[] | null>((resolve) => {
      const timer = setTimeout(() => { this.waiting.delete(id); resolve(null); }, 60_000);
      this.waiting.set(id, (value) => { clearTimeout(timer); resolve(value); });
      this.child!.stdin.write(JSON.stringify({ id, path: file }) + "\n");
    });
    void fs.unlink(file).catch(() => {});
    return segments;
  }

  close(): void {
    try { this.child?.kill(); } catch {}
    this.child = null;
    this.ready = null;
  }
}

export function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function pcm16Rms(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const value = pcm.readInt16LE(index * 2);
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}
