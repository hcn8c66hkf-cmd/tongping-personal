import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RawSubtitleCue } from "./media-context.js";

// Burned-in subtitles (common on Douyin AI dramas) are pixels, not DOM
// text. On Windows the built-in OCR engine (Windows.Media.Ocr, the same one
// the Snipping Tool uses) reads them locally in ~100ms per crop.

export interface OcrLine {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const OCR_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($engine -eq $null) { [Console]::Out.WriteLine('{"ready":false}'); exit 1 }
[Console]::Out.WriteLine('{"ready":true,"lang":"' + $engine.RecognizerLanguage.LanguageTag + '"}')
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $parts = $line.Split([char]9, 2)
  $id = $parts[0]
  try {
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($parts[1])) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $stream.Dispose()
    $lines = @()
    foreach ($l in $result.Lines) {
      $xs = @($l.Words | ForEach-Object { $_.BoundingRect.X })
      $xe = @($l.Words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width })
      $ys = @($l.Words | ForEach-Object { $_.BoundingRect.Y })
      $ye = @($l.Words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height })
      $lines += @{ text = $l.Text; left = ($xs | Measure-Object -Minimum).Minimum; right = ($xe | Measure-Object -Maximum).Maximum; top = ($ys | Measure-Object -Minimum).Minimum; bottom = ($ye | Measure-Object -Maximum).Maximum }
    }
    [Console]::Out.WriteLine((@{ id = $id; lines = $lines } | ConvertTo-Json -Compress -Depth 5))
  } catch {
    [Console]::Out.WriteLine((@{ id = $id; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

export class WindowsOcr {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<boolean> | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly waiting = new Map<string, (lines: OcrLine[] | null) => void>();
  private readonly dir = path.join(os.tmpdir(), "tongping-ocr");

  available(): boolean {
    return process.platform === "win32";
  }

  private start(): Promise<boolean> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const scriptPath = path.join(this.dir, "ocr-helper.ps1");
      // UTF-8 with BOM so Windows PowerShell 5 reads the script correctly.
      await fs.writeFile(scriptPath, "﻿" + OCR_SCRIPT, "utf8");
      const child = spawn("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
      ], { windowsHide: true });
      this.child = child;
      child.stdout.setEncoding("utf8");
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
        setTimeout(() => settle(false), 15_000).unref?.();
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
            const raw = Array.isArray(message.lines) ? message.lines : message.lines ? [message.lines] : [];
            done(message.error ? null : raw.map((line: any) => ({
              text: String(line.text ?? ""),
              left: Number(line.left) || 0,
              right: Number(line.right) || 0,
              top: Number(line.top) || 0,
              bottom: Number(line.bottom) || 0,
            })));
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

  async recognize(png: Buffer): Promise<OcrLine[] | null> {
    if (!this.available()) return null;
    if (!(await this.start()) || !this.child) return null;
    const id = String(this.nextId++);
    const file = path.join(this.dir, "crop-" + id + ".png");
    await fs.writeFile(file, png);
    const lines = await new Promise<OcrLine[] | null>((resolve) => {
      const timer = setTimeout(() => { this.waiting.delete(id); resolve(null); }, 4_000);
      this.waiting.set(id, (value) => { clearTimeout(timer); resolve(value); });
      this.child!.stdin.write(id + "\t" + file + "\n");
    });
    void fs.unlink(file).catch(() => {});
    return lines;
  }

  close(): void {
    try { this.child?.kill(); } catch {}
    this.child = null;
    this.ready = null;
  }
}

const CJK_CHAR = /[\u3400-\u9fff]/;
const CJK = /[　-〿㐀-鿿＀-￯]/;

// Windows OCR separates CJK characters with spaces; drop those, keep the
// spaces between Latin words.
export function normalizeOcrText(text: string): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  let out = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (char === " ") {
      const before = chars[index - 1] ?? "";
      const after = chars[index + 1] ?? "";
      if (CJK.test(before) || CJK.test(after)) continue;
    }
    out += char;
  }
  return out;
}

const NOISE = [/作者声明/, /内容由\s*AI\s*生成/i, /^@/, /#/, /^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})?$/, /^(连播|清屏|倍速|智能|弹幕|发送)$/];

// The subtitle is the centred line(s) of the crop; corner badges, @author
// tags, hashtags and player chrome are dropped.
export function pickSubtitleText(lines: OcrLine[], cropWidth: number): string {
  const kept: string[] = [];
  for (const line of lines) {
    const text = normalizeOcrText(line.text);
    if (Array.from(text).length < 2) continue;
    // Real dialogue has at least two CJK characters or one Latin word;
    // corner badges misread as "00黔" do not.
    const cjk = Array.from(text).filter((char) => CJK_CHAR.test(char)).length;
    if (cjk < 2 && !/[A-Za-z]{3,}/.test(text)) continue;
    if (NOISE.some((pattern) => pattern.test(text))) continue;
    const center = (line.left + line.right) / 2;
    if (center < cropWidth * 0.25 || center > cropWidth * 0.75) continue;
    kept.push(text);
  }
  return kept.slice(-2).join(" ");
}

// Extend the running cue while the same line stays on screen; start a new
// cue when the text changes. Times are source-media seconds.
export function mergeOcrCue(
  cues: RawSubtitleCue[],
  text: string,
  mediaTime: number,
  maxCues = 400,
): void {
  if (!text) return;
  const last = cues[cues.length - 1];
  if (
    last &&
    last.text === text &&
    mediaTime >= last.startTime &&
    mediaTime - last.endTime <= 4
  ) {
    last.endTime = Math.max(last.endTime, mediaTime);
    return;
  }
  cues.push({ startTime: mediaTime, endTime: mediaTime, text, track: "ocr", language: "zh" });
  if (cues.length > maxCues) cues.splice(0, cues.length - maxCues);
}
