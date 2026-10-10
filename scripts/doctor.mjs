#!/usr/bin/env node
// 同屏 TongPing 个人版 体检：npm run doctor
// 只读检查，不改任何文件。最后输出一段「诊断摘要」，令牌和密码一律打码，
// 可以直接整段贴给 AI（配合 docs/TROUBLESHOOTING.md）排障。
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const envFile = path.join(root, ".env");
const envFromFile = loadEnvFile(envFile);
const env = (key) => process.env[key]?.trim() || "";
const rows = [];
const add = (level, id, message, fix = "") => rows.push({ level, id, message, fix });

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const port = env("TONGPING_PORT") || "45921";
const home = path.resolve(expandHome(env("TONGPING_HOME") || path.join(os.homedir(), ".tongping")));
const localUrl = `http://127.0.0.1:${port}`;

// 1. Node.js
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) add("ok", "node", `Node.js ${process.version}`);
else add("fail", "node", `Node.js ${process.version} 太旧`, "安装 Node.js 20 LTS 或更新版本（见 INSTALL.md 第 1 步）");

// 2. Dependencies
if (!existsSync(path.join(root, "node_modules"))) {
  add("fail", "deps", "没有 node_modules", "在项目目录运行 npm ci");
} else {
  for (const dep of ["playwright", "tsx", "ws", "@modelcontextprotocol/server"]) {
    const file = path.join(root, "node_modules", ...dep.split("/"), "package.json");
    if (!existsSync(file)) add("fail", "deps", `缺少依赖 ${dep}`, "删除 node_modules 后重新 npm ci");
  }
  if (!rows.some((r) => r.id === "deps")) {
    const pw = JSON.parse(readFileSync(path.join(root, "node_modules", "playwright", "package.json"), "utf8"));
    add("ok", "deps", `依赖已安装（playwright ${pw.version}）`);
  }
}

// 3. Browser
const channel = env("TONGPING_CHANNEL");
const exe = env("TONGPING_EXECUTABLE_PATH");
if (exe) {
  if (existsSync(exe)) add("ok", "browser", "使用自定义浏览器路径");
  else add("fail", "browser", "TONGPING_EXECUTABLE_PATH 指向的文件不存在", "改成真实的 chrome.exe / chromium 路径，或删掉这一行");
} else if (channel) {
  const found = findChannel(channel);
  if (found) add("ok", "browser", `使用本机 ${channel}`);
  else add("fail", "browser", `TONGPING_CHANNEL=${channel}，但本机没找到这个浏览器`, "安装 Chrome/Edge，或删掉这一行改用 npx playwright install chromium");
} else {
  const bundled = await playwrightChromium();
  if (major < 20) add("info", "browser", "Node.js 版本太旧，先升级 Node 再检查浏览器");
  else if (bundled) {
    const missing = linuxMissingLibs(bundled);
    if (missing.length) add("fail", "browser", `Playwright Chromium 缺系统库：${missing.slice(0, 4).join(", ")}${missing.length > 4 ? " …" : ""}`, "运行 sudo npx playwright install-deps chromium（见 TROUBLESHOOTING B3）");
    else add("ok", "browser", "使用 Playwright 自带 Chromium");
  }
  else if (findChannel("chrome")) add("warn", "browser", "本机有 Chrome，但 .env 里没写 TONGPING_CHANNEL=chrome，Playwright Chromium 也没装", "在 .env 加一行 TONGPING_CHANNEL=chrome（推荐），或运行 npx playwright install chromium");
  else add("fail", "browser", "没有可用的浏览器", "运行 npx playwright install chromium（Linux 加 --with-deps），或安装 Chrome 后设 TONGPING_CHANNEL=chrome");
}

// 4. ffmpeg (companion / voice input)
const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", windowsHide: true });
if (ff.status === 0) add("ok", "ffmpeg", ff.stdout.split("\n")[0].slice(0, 60));
else add("warn", "ffmpeg", "没找到 ffmpeg：「陪看」缓冲会一直是 0 秒，按住说话也不能用", "安装 ffmpeg 并加入 PATH（见 INSTALL.md「安装 ffmpeg」），然后重开终端");

// 4b. Optional local subtitles
const asrDir = path.resolve(expandHome(env("TONGPING_ASR_DIR") || path.join(home, "asr")));
const asrPython = process.platform === "win32" ? path.join(asrDir, ".venv", "Scripts", "python.exe") : path.join(asrDir, ".venv", "bin", "python");
if (existsSync(asrPython) && existsSync(path.join(asrDir, "asr_server.py"))) {
  add("ok", "asr", `本地字幕已安装${env("HF_ENDPOINT") ? `（模型镜像 ${env("HF_ENDPOINT")}）` : ""}`);
} else {
  add("info", "asr", "本地字幕未安装（可选）：没有字幕的视频 AI 读不到台词", "需要的话运行 npm run asr:install（国内加 -- --cn），见 INSTALL.md 5b");
}

// 5. Config
if (!existsSync(envFile)) add("warn", "env", "没有 .env 文件（会全部使用默认值）", "复制 .env.example 为 .env");
else add("ok", "env", `.env 已读取（${Object.keys(envFromFile).length} 项）`);
const publicOrigin = env("TONGPING_PUBLIC_ORIGIN");
const password = env("TONGPING_OAUTH_PASSWORD");
if (publicOrigin) {
  let parsed = null;
  try { parsed = new URL(publicOrigin); } catch {}
  if (!parsed) add("fail", "public", "TONGPING_PUBLIC_ORIGIN 不是合法网址", "形如 https://xxxx.trycloudflare.com，不要带 /mcp");
  else {
    if (parsed.protocol !== "https:") add("fail", "public", "TONGPING_PUBLIC_ORIGIN 必须是 https://", "Claude 和 ChatGPT 都只接受 HTTPS 连接器地址");
    if (parsed.pathname !== "/" ) add("fail", "public", "TONGPING_PUBLIC_ORIGIN 只写域名，不要带路径", `改成 ${parsed.origin}`);
    if (!rows.some((r) => r.id === "public")) add("ok", "public", `公网地址 ${parsed.host}`);
  }
  if (!password) add("fail", "oauth", "设置了公网地址但没设 TONGPING_OAUTH_PASSWORD，OAuth 不会开启，Claude/ChatGPT 连不上", "在 .env 设一个 12 位以上的密码");
  else if (password.length < 12) add("warn", "oauth", "OAuth 密码少于 12 位", "公网可访问，建议换一个更长的随机密码");
  else add("ok", "oauth", "OAuth 密码已设置");
} else {
  add("info", "public", "没设公网地址：只有本机客户端（Claude Code / Codex / Claude Desktop）能用", "要接 claude.ai / ChatGPT 网页版，见 INSTALL.md 第 6 步");
}

// 6. Data directory
try {
  if (existsSync(home)) {
    accessSync(home, constants.W_OK);
    add("ok", "home", `数据目录可写`);
  } else add("info", "home", "数据目录还没创建（第一次 npm run up 会自动创建）");
} catch {
  add("fail", "home", "数据目录不可写", "换一个 TONGPING_HOME，或修复目录权限");
}

// 7. Running daemon
let health = null;
try {
  const response = await fetch(localUrl + "/health", { signal: AbortSignal.timeout(3000) });
  health = await response.json();
} catch {}
if (!health) {
  const busy = await portBusy(Number(port));
  if (busy) add("fail", "daemon", `端口 ${port} 被别的程序占用，但不是同屏`, "关掉占用端口的程序，或在 .env 改 TONGPING_PORT");
  else add("info", "daemon", "同屏没有在运行", "运行 npm run up");
} else {
  add(health.service === "tongping" ? "ok" : "fail", "daemon", `daemon 在线，版本 ${health.version}`);
  if (health.version && health.version !== pkg.version) {
    add("warn", "version", `正在运行的是 ${health.version}，代码是 ${pkg.version}`, "升级后要 Ctrl+C 停掉再 npm run up");
  }
  if (health.worker?.connected) add("ok", "worker", `worker 已连接（${health.workerBuild}）`);
  else add("fail", "worker", "worker 没连上 daemon", "看 npm run up 窗口里 [worker] 开头的报错；常见是浏览器没装好");
  if (publicOrigin && password && health.oauth !== true) add("fail", "oauth", "daemon 没开启 OAuth", "改完 .env 后必须重启 npm run up");
  const dc = health.delayedCompanion;
  const cc = health.companionCommand;
  if (cc?.lastMode === "companion" && cc?.lastOk && dc && dc.active === 0 && health.mediaWs?.companionAppProfiles?.length) {
    add("warn", "companion", "陪看已请求但没有缓冲会话（多半是缺 ffmpeg）", "安装 ffmpeg 后重启");
  }
  const badExits = (dc?.recentExits ?? []).filter((exit) => exit.exitCode !== 0);
  if (badExits.length) add("warn", "companion", `ffmpeg 最近异常退出 ${badExits.length} 次`, "把下面摘要里的 delayedCompanion.recentExits 贴给 AI");
}

// 8. Public reachability
if (publicOrigin && health) {
  try {
    const response = await fetch(publicOrigin.replace(/\/+$/, "") + "/.well-known/oauth-authorization-server", { signal: AbortSignal.timeout(8000) });
    if (response.ok) add("ok", "tunnel", "公网地址能访问到本机同屏");
    else add("fail", "tunnel", `公网地址返回 HTTP ${response.status}`, response.status === 403 ? "Host 白名单问题：检查 TONGPING_ALLOWED_HOSTS" : "检查隧道是否指向 127.0.0.1:" + port);
  } catch (error) {
    add("fail", "tunnel", "公网地址访问不到：" + String(error?.cause?.code || error?.message || error).slice(0, 80), "隧道没开、地址变了（临时隧道每次重启都会换），或本机网络拦截");
  }
}

// Report
const icon = { ok: "✅", warn: "⚠️ ", fail: "❌", info: "ℹ️ " };
console.log(`\n同屏 TongPing 体检  (${pkg.name} ${pkg.version})\n`);
for (const row of rows) {
  console.log(`${icon[row.level]} [${row.id}] ${row.message}`);
  if (row.fix && row.level !== "ok") console.log(`      → ${row.fix}`);
}
const fails = rows.filter((r) => r.level === "fail").length;
console.log("\n----- 诊断摘要（已打码，可整段贴给 AI）-----");
console.log(JSON.stringify({
  version: pkg.version,
  os: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.version,
  port,
  home: redactPath(home),
  env: Object.fromEntries(Object.entries({ ...envFromFile, ...pickEnv() }).map(([k, v]) => [k, redactValue(k, v)])),
  checks: rows.map((r) => `${r.level}:${r.id}:${r.message}`),
  health: health ? {
    version: health.version, oauth: health.oauth, remoteWorker: health.remoteWorker,
    worker: health.worker && { connected: health.worker.connected, ageMs: health.worker.ageMs },
    workerBuild: health.workerBuild,
    liveWs: health.liveWs && { appAccepted: health.liveWs.appAccepted, appRejected: health.liveWs.appRejected, appRejectedTicket: health.liveWs.appRejectedTicket, appRejectedCard: health.liveWs.appRejectedCard, lastWorkerCloseReason: health.liveWs.lastWorkerCloseReason },
    mediaWs: health.mediaWs && { appReady: health.mediaWs.appReady, streamStarts: health.mediaWs.streamStarts, segmentsAccepted: health.mediaWs.segmentsAccepted, segmentsDroppedNoViewer: health.mediaWs.segmentsDroppedNoViewer },
    delayedCompanion: health.delayedCompanion && { active: health.delayedCompanion.active, recentExits: (health.delayedCompanion.recentExits ?? []).slice(-3).map((e) => ({ exitCode: e.exitCode, ageMs: e.ageMs, chunksIn: e.chunksIn, stderrTail: String(e.stderrTail ?? "").slice(-300) })) },
    companionCommand: health.companionCommand && { lastMode: health.companionCommand.lastMode, lastOk: health.companionCommand.lastOk, lastError: health.companionCommand.lastError },
  } : null,
}, null, 2));
console.log("----- 摘要结束 -----\n");
process.exit(fails ? 1 : 0);

function pickEnv() {
  return Object.fromEntries(Object.keys(process.env).filter((k) => k.startsWith("TONGPING_")).map((k) => [k, process.env[k]]));
}
function redactValue(key, value) {
  if (/TOKEN|PASSWORD|SECRET|KEY/i.test(key)) return value ? `<已设置，${String(value).length} 位>` : "<空>";
  if (/HOME|PATH|FILE/i.test(key)) return redactPath(String(value));
  return value;
}
function redactPath(value) {
  const homeDir = os.homedir();
  return value.split(homeDir).join("~").split(homeDir.replaceAll("\\", "/")).join("~");
}
function findChannel(name) {
  const candidates = {
    chrome: process.platform === "win32"
      ? [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, "Google", "Chrome", "Application", "chrome.exe"))
      : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"],
    msedge: process.platform === "win32"
      ? [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean).map((d) => path.join(d, "Microsoft", "Edge", "Application", "msedge.exe"))
      : process.platform === "darwin" ? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : ["/usr/bin/microsoft-edge", "/opt/microsoft/msedge/msedge"],
  }[name] ?? [];
  return candidates.find((file) => { try { return statSync(file).isFile(); } catch { return false; } });
}
async function playwrightChromium() {
  // Importing playwright on Node < 20 makes it print a warning and exit the
  // whole process, which would hide the rest of this report.
  if (major < 20) return null;
  try {
    const { chromium } = await import("playwright");
    const file = chromium.executablePath();
    return file && existsSync(file) ? file : null;
  } catch { return null; }
}
function linuxMissingLibs(executable) {
  if (process.platform !== "linux") return [];
  const out = spawnSync("ldd", [executable], { encoding: "utf8" });
  if (out.status !== 0 || !out.stdout) return [];
  return out.stdout.split("\n").filter((line) => line.includes("not found")).map((line) => line.trim().split(/\s+/)[0]);
}
function portBusy(p) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => server.close(() => resolve(false)));
    server.listen(p, "127.0.0.1");
  });
}
function loadEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return out;
}
function expandHome(value) {
  return value === "~" || value.startsWith("~/") || value.startsWith("~\\") ? path.join(os.homedir(), value.slice(1)) : value;
}
