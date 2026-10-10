#!/usr/bin/env node
// 同屏 TongPing 个人版 一键启动：
//   1. 读取 .env（命令行里已设置的变量优先）
//   2. 启动 daemon（MCP 服务 + 卡片 + 群聊），只监听本机
//   3. 等 daemon 健康后，启动本机 worker（真正开 Chrome 的那个进程）
//   4. Ctrl+C 一次，两个进程一起退出
//
// daemon 和 worker 使用同一个 TONGPING_HOME 下的两个子目录，避免两个进程抢同一个
// Chromium profile 锁。
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
loadEnvFile(path.join(root, ".env"));

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  fail(`需要 Node.js 20 或更新版本，当前是 ${process.version}。请先升级 Node.js。`);
}
if (!existsSync(path.join(root, "node_modules"))) {
  fail("还没有安装依赖。请先在项目目录运行：npm ci");
}

const home = path.resolve(
  expandHome(process.env.TONGPING_HOME?.trim() || path.join(os.homedir(), ".tongping")),
);
const port = process.env.TONGPING_PORT?.trim() || "45921";
const localUrl = `http://127.0.0.1:${port}`;
const daemonHome = path.join(home, "daemon");
const workerHome = path.join(home, "worker");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

// Publishing through a tunnel: accept the tunnel hostname without making the
// user hand-maintain TONGPING_ALLOWED_HOSTS / _ORIGINS.
const publicHost = (() => {
  try { return new URL(process.env.TONGPING_PUBLIC_ORIGIN?.trim() || "").hostname; } catch { return ""; }
})();
const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
const hostAllowList = (name) => {
  const configured = process.env[name]?.trim();
  if (configured) return configured;
  return [...loopbackHosts, ...(publicHost ? [publicHost] : [])].join(",");
};

if (!hasCommand("ffmpeg")) {
  console.warn("提示：没找到 ffmpeg。逛网页和聊天不受影响，但「陪看」（延迟缓冲播放）会一直显示缓冲 0 秒。");
  console.warn("      安装方法见 docs/INSTALL.md 的「安装 ffmpeg」一节。");
}

const children = [];
let stopping = false;

const daemon = run("daemon", path.join(root, "src", "daemon.ts"), {
  TONGPING_HOME: daemonHome,
  TONGPING_PORT: port,
  TONGPING_HOST: process.env.TONGPING_HOST?.trim() || "127.0.0.1",
  TONGPING_REMOTE_WORKER: "1",
  TONGPING_ALLOWED_HOSTS: hostAllowList("TONGPING_ALLOWED_HOSTS"),
  TONGPING_ALLOWED_ORIGINS: hostAllowList("TONGPING_ALLOWED_ORIGINS"),
  // Personal edition: the local worker authenticates with the daemon's
  // worker-token file. Both switches are required for that token path.
  TONGPING_DEPLOYMENT_MODE: "private-single-user",
  TONGPING_PAIRING_AUTHORITY: "private-single-user",
  // The worker opens its audio/video helper tab against this origin.
  TONGPING_CLOUD_URL: localUrl,
});

await waitForHealth(localUrl, daemon);
const workerToken = readFileSync(path.join(daemonHome, "worker-auth", "worker-token"), "utf8").trim();

run("worker", path.join(root, "src", "worker-client.ts"), {
  TONGPING_HOME: workerHome,
  TONGPING_CLOUD_URL: localUrl,
  TONGPING_WORKER_TOKEN: workerToken,
  TONGPING_WORKER_NAME: process.env.TONGPING_WORKER_NAME?.trim() || os.hostname(),
  // Optional local subtitles (npm run asr:install puts the service here).
  TONGPING_ASR_DIR: path.resolve(expandHome(process.env.TONGPING_ASR_DIR?.trim() || path.join(home, "asr"))),
});

const publicOrigin = process.env.TONGPING_PUBLIC_ORIGIN?.trim();
console.log("");
console.log("==============================================");
console.log(" 同屏 TongPing 个人版 已启动");
console.log(`  本机健康检查: ${localUrl}/health`);
console.log(`  本机 MCP:     ${localUrl}/mcp`);
console.log(`  手机/网页接管: ${localUrl}/live`);
console.log(`  daemon 令牌:  ${path.join(daemonHome, "daemon-token")}`);
if (publicOrigin) {
  console.log(`  公网 MCP 地址（填进 Claude / ChatGPT）: ${publicOrigin.replace(/\/+$/, "")}/mcp`);
} else {
  console.log("  还没设置 TONGPING_PUBLIC_ORIGIN：现在只能本机客户端（Claude Code / Codex）使用。");
}
console.log(" 关闭：在这个窗口按 Ctrl+C");
console.log("==============================================");
console.log("");

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

function run(name, entry, extraEnv) {
  const child = spawn(process.execPath, [tsxCli, entry], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[${name}] `;
  const pipe = (stream, out) => {
    let buffered = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) out.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`${prefix}已退出（code=${code ?? "-"} signal=${signal ?? "-"}），同屏一起停止。`);
    console.error("把上面几十行日志复制给 AI，并让它读 docs/TROUBLESHOOTING.md 排障。");
    stopAll(code || 1);
  });
  children.push(child);
  return child;
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) process.exit(child.exitCode || 1);
    try {
      const response = await fetch(url + "/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`60 秒内 ${url}/health 没有响应。端口 ${port} 可能被占用，运行 npm run doctor 检查。`);
  stopAll(1);
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    process.exit(code);
  }, 4_000).unref();
  Promise.all(children.map((child) =>
    child.exitCode !== null ? null : new Promise((resolve) => child.once("exit", resolve)),
  )).then(() => process.exit(code));
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function expandHome(value) {
  return value === "~" || value.startsWith("~/") || value.startsWith("~\\")
    ? path.join(os.homedir(), value.slice(1))
    : value;
}

function hasCommand(command) {
  try {
    return spawnSync(command, ["-version"], { stdio: "ignore", windowsHide: true }).status === 0;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error("错误：" + message);
  process.exit(1);
}
