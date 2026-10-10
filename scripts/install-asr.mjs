#!/usr/bin/env node
// 同屏 TongPing：安装本地字幕（语音识别）服务。
//   npm run asr:install                 自动：有 NVIDIA 显卡装 GPU 版，否则 CPU 版
//   npm run asr:install -- --cpu        强制 CPU 版（下载小，速度慢一些）
//   npm run asr:install -- --cn         国内网络：pip 用清华镜像，模型从 hf-mirror.com 下载
//   npm run asr:install -- --uninstall  删除字幕服务
// 安装位置：TONGPING_ASR_DIR（默认 TONGPING_HOME/asr，即 ~/.tongping/asr）。
// 装完重启 npm run up 生效。没有它同屏照常工作，只是没字幕的视频 AI 读不到台词。
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const envFile = path.join(root, ".env");
loadEnvFile(envFile);
const args = new Set(process.argv.slice(2));
const home = path.resolve(expandHome(process.env.TONGPING_HOME?.trim() || path.join(os.homedir(), ".tongping")));
const asrDir = path.resolve(expandHome(process.env.TONGPING_ASR_DIR?.trim() || path.join(home, "asr")));
const venv = path.join(asrDir, ".venv");
const venvPython = process.platform === "win32"
  ? path.join(venv, "Scripts", "python.exe")
  : path.join(venv, "bin", "python");
const PIP_CN = "https://pypi.tuna.tsinghua.edu.cn/simple";
const HF_CN = "https://hf-mirror.com";

if (args.has("--uninstall")) {
  rmSync(asrDir, { recursive: true, force: true });
  console.log(`已删除 ${asrDir}。已下载的模型缓存在 ~/.cache/huggingface，不需要可手动删除。`);
  console.log("重启 npm run up 生效。");
  process.exit(0);
}

const cn = args.has("--cn");
const wantGpu = !args.has("--cpu") && process.platform !== "darwin" && hasNvidiaGpu();
step(`安装位置：${asrDir}`);
step(`模式：${wantGpu ? "GPU（检测到 NVIDIA 显卡，约下载 1.3 GB 运行库 + 1.6 GB 模型）" : "CPU（约下载 0.3 GB 运行库 + 0.5 GB 模型）"}${cn ? "，国内镜像" : ""}`);

// 1. Python 3.9 - 3.14
const python = findPython();
if (!python) {
  fail("没找到 Python 3.9–3.14。请先安装 Python 3.11（https://www.python.org/downloads/ ，Windows 安装时勾选「Add python.exe to PATH」），然后重开终端再运行。");
}
step(`使用 Python：${python.label}（${python.version}）`);

// 2. venv
mkdirSync(asrDir, { recursive: true });
if (!existsSync(venvPython)) {
  step("创建独立的 Python 虚拟环境…");
  run(python.cmd, [...python.args, "-m", "venv", venv]);
}

// 3. packages
const pipIndex = cn ? ["-i", PIP_CN] : [];
step("安装 faster-whisper（第一次需要几分钟）…");
run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", "-q", "--upgrade", "pip"], { allowFail: true });
// av 19 removed an argument faster-whisper 1.2.1 still passes ("open() got an
// unexpected keyword argument 'metadata_errors'"), so keep PyAV on 18.x.
run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", ...pipIndex, "faster-whisper==1.2.1", "av>=11,<19"]);
if (wantGpu) {
  step("安装 GPU 运行库（cuBLAS / cuDNN，体积较大）…");
  const gpu = run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", ...pipIndex, "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"], { allowFail: true });
  if (!gpu) console.warn("  GPU 运行库安装失败，会自动退回 CPU 模式（慢一些但能用）。");
}

// 4. server script
copyFileSync(path.join(root, "asr", "asr_server.py"), path.join(asrDir, "asr_server.py"));

// 5. HF mirror for the model download (also used at runtime by the worker)
if (cn) setEnvLine("HF_ENDPOINT", HF_CN);

// 6. warm up: downloads the model once and checks that it loads
step("下载并加载模型（第一次可能要几分钟，取决于网速）…");
const warm = await warmUp();
if (!warm.ok) {
  console.error("\n模型加载失败：" + warm.error);
  if (/huggingface|hf\.co|Connection|timed out|resolve|SSL|ProxyError|MaxRetry/i.test(warm.error) && !cn) {
    console.error("看起来是连不上 huggingface.co。国内网络请改用：npm run asr:install -- --cn");
  }
  process.exit(1);
}
console.log("");
console.log(`✅ 字幕服务已就绪：模型 ${warm.model}，设备 ${warm.device}，加载用时 ${warm.seconds}s`);
console.log("   重启同屏（Ctrl+C 后再 npm run up）后生效。陪看没有字幕的视频时，AI 也能读到台词。");

function hasNvidiaGpu() {
  try { return spawnSync("nvidia-smi", ["-L"], { encoding: "utf8", windowsHide: true }).status === 0; } catch { return false; }
}

function findPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3.11"]], ["py", ["-3.12"]], ["py", ["-3.10"]], ["py", ["-3.13"]], ["py", ["-3.14"]], ["python", []], ["python3", []]]
    : [["python3.11", []], ["python3.12", []], ["python3.10", []], ["python3.13", []], ["python3.14", []], ["python3", []], ["python", []]];
  for (const [cmd, pre] of candidates) {
    try {
      const out = spawnSync(cmd, [...pre, "-c", "import sys,venv;print('%d.%d.%d'%sys.version_info[:3])"], { encoding: "utf8", windowsHide: true });
      const version = out.stdout?.trim();
      if (out.status !== 0 || !version) continue;
      const [major, minor] = version.split(".").map(Number);
      if (major === 3 && minor >= 9 && minor <= 14) return { cmd, args: pre, version, label: [cmd, ...pre].join(" ") };
    } catch {}
  }
  return null;
}

function run(cmd, argv, { allowFail = false } = {}) {
  const result = spawnSync(cmd, argv, { stdio: "inherit", windowsHide: true });
  if (result.status === 0) return true;
  if (allowFail) return false;
  fail(`命令失败：${cmd} ${argv.join(" ")}\n网络问题可加 --cn 重试；把上面的报错发给 AI 并让它读 docs/TROUBLESHOOTING.md 的 F4。`);
}

function warmUp() {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(venvPython, [path.join(asrDir, "asr_server.py")], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
    });
    let stderr = "";
    let buffer = "";
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, error: "30 分钟内没有加载完成（网速太慢？）" }); }, 30 * 60_000);
    child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-2000); });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (const line of buffer.split("\n").slice(0, -1)) {
        try {
          const msg = JSON.parse(line);
          if (msg.warning) console.warn("  " + msg.warning);
          if ("ready" in msg) {
            clearTimeout(timer);
            child.stdin.end();
            child.kill();
            resolve(msg.ready
              ? { ok: true, model: msg.model, device: msg.device, seconds: Math.round((Date.now() - started) / 1000) }
              : { ok: false, error: msg.error || stderr });
          }
        } catch {}
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    });
    child.on("exit", (code) => { clearTimeout(timer); resolve({ ok: false, error: `进程退出 code=${code}\n${stderr.slice(-800)}` }); });
  });
}

function setEnvLine(key, value) {
  // Start from the template so a brand-new .env keeps the usual defaults.
  if (!existsSync(envFile)) copyFileSync(path.join(root, ".env.example"), envFile);
  let text = readFileSync(envFile, "utf8");
  const re = new RegExp(`^\\s*#?\\s*${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : text.replace(/\s*$/, "\n") + `${key}=${value}\n`;
  writeFileSync(envFile, text);
  process.env[key] = value;
  step(`已在 .env 写入 ${key}=${value}`);
}

function step(message) { console.log("▶ " + message); }
function fail(message) { console.error("❌ " + message); process.exit(1); }
function expandHome(value) {
  return value === "~" || value.startsWith("~/") || value.startsWith("~\\") ? path.join(os.homedir(), value.slice(1)) : value;
}
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) process.env[key] = value;
  }
}
