#!/usr/bin/env node
// One-click public startup:
//   1. Start the account-bound ngrok HTTPS endpoint.
//   2. Discover its public URL from ngrok's local API.
//   3. Persist only TONGPING_PUBLIC_ORIGIN in .env.
//   4. Start TongPing with that origin already in the process environment.
// Ctrl+C stops both TongPing and ngrok.
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const envFile = path.join(root, ".env");
const env = readEnvFile(envFile);
const port = env.TONGPING_PORT?.trim() || "45921";

const version = spawnSync("ngrok", ["version"], {
  encoding: "utf8",
  windowsHide: true,
});
if (version.status !== 0) {
  fail(
    "没有找到 ngrok。请先安装 ngrok，并运行一次 ngrok config add-authtoken 你的令牌。",
  );
}

const existing = await findNgrokTunnel(port).catch(() => null);
let ngrok = null;
let publicOrigin = existing;

if (publicOrigin) {
  console.log("发现已经运行的 ngrok：" + publicOrigin);
} else {
  console.log("正在连接固定 ngrok 隧道……");
  ngrok = spawn(
    "ngrok",
    [
      "http",
      port,
      "--log=stdout",
      "--log-format=logfmt",
      "--web-addr=127.0.0.1:4040",
    ],
    {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    },
  );
  pipeWithPrefix(ngrok.stdout, "[ngrok] ", process.stdout);
  pipeWithPrefix(ngrok.stderr, "[ngrok] ", process.stderr);
  publicOrigin = await waitForNgrok(port, ngrok);
}

writePublicOrigin(envFile, publicOrigin);
console.log("固定公网地址：" + publicOrigin);
console.log("ChatGPT / Claude 的 MCP 地址：" + publicOrigin + "/mcp");
console.log("正在启动同屏……");
console.log("");

const tongping = spawn(process.execPath, [path.join(root, "scripts", "start.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    TONGPING_PUBLIC_ORIGIN: publicOrigin,
  },
  stdio: "inherit",
  windowsHide: false,
});

let stopping = false;
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

tongping.on("exit", (code) => {
  if (!stopping) stopAll(code || 0);
});
if (ngrok) {
  ngrok.on("exit", (code) => {
    if (!stopping) {
      console.error("ngrok 已退出（code=" + (code ?? "-") + "），同屏一起停止。");
      stopAll(code || 1);
    }
  });
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  if (tongping.exitCode === null) tongping.kill("SIGTERM");
  if (ngrok && ngrok.exitCode === null) ngrok.kill("SIGTERM");
  setTimeout(() => process.exit(code), 4_000).unref();
  const running = [tongping, ngrok].filter(
    (child) => child && child.exitCode === null,
  );
  Promise.all(
    running.map(
      (child) => new Promise((resolve) => child.once("exit", resolve)),
    ),
  ).then(() => process.exit(code));
}

async function waitForNgrok(targetPort, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(
        "ngrok 没有启动成功。确认已经运行过 ngrok config add-authtoken，并且没有别的 ngrok 窗口占用 4040 端口。",
      );
    }
    const url = await findNgrokTunnel(targetPort).catch(() => null);
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  child.kill("SIGTERM");
  fail("30 秒内没有拿到 ngrok 固定地址。把上面的 ngrok 日志发给 AI。");
}

async function findNgrokTunnel(targetPort) {
  const response = await fetch("http://127.0.0.1:4040/api/tunnels");
  if (!response.ok) return null;
  const data = await response.json();
  const tunnels = Array.isArray(data?.tunnels) ? data.tunnels : [];
  const expected = String(targetPort);
  const tunnel = tunnels.find((item) => {
    const publicUrl = String(item?.public_url || "");
    const addr = String(item?.config?.addr || "");
    return publicUrl.startsWith("https://") && (
      addr === expected ||
      addr.endsWith(":" + expected) ||
      addr.endsWith("/" + expected)
    );
  });
  return tunnel ? new URL(tunnel.public_url).origin : null;
}

function writePublicOrigin(file, origin) {
  const original = existsSync(file) ? readFileSync(file, "utf8") : "";
  const hadBom = original.startsWith("\uFEFF");
  const body = original.replace(/^\uFEFF/, "");
  const lines = body.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*#?\s*TONGPING_PUBLIC_ORIGIN\s*=/.test(line)) {
      replaced = true;
      return "TONGPING_PUBLIC_ORIGIN=" + origin;
    }
    return line;
  });
  if (!replaced) {
    if (next.length && next[next.length - 1] !== "") next.push("");
    next.push("TONGPING_PUBLIC_ORIGIN=" + origin);
  }
  const newline = body.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(file, (hadBom ? "\uFEFF" : "") + next.join(newline), "utf8");
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function pipeWithPrefix(stream, prefix, output) {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) output.write(prefix + line + "\n");
  });
}

function fail(message) {
  console.error("错误：" + message);
  process.exit(1);
}
