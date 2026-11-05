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
const bundledNgrok = path.join(root, "ngrok.exe");
const ngrokCommand =
  process.env.TONGPING_NGROK_BIN?.trim() ||
  (process.platform === "win32" && existsSync(bundledNgrok)
    ? bundledNgrok
    : "ngrok");

const version = spawnSync(ngrokCommand, ["version"], {
  encoding: "utf8",
  windowsHide: true,
});
if (version.status !== 0) {
  fail(
    "没有找到 ngrok。请先安装 ngrok，并运行一次 ngrok config add-authtoken 你的令牌。",
  );
}

let ngrok = null;
let tongping = null;
let stopping = false;
let restartingTongping = false;

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

const configuredPublicOrigin = normalizeOrigin(env.TONGPING_PUBLIC_ORIGIN);
if (configuredPublicOrigin) {
  console.log("正在先启动本地同屏……");
  tongping = startTongping(configuredPublicOrigin);
  await waitForTongping(port, tongping);
  console.log("本地同屏已就绪，正在开放固定隧道……");
}

let existing = await findNgrokTunnel(port).catch(() => null);
if (existing && await endpointIsOffline(existing)) {
  console.log("发现已失效的 ngrok 残留进程，正在自动清理……");
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/IM", "ngrok.exe"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  existing = null;
}
let publicOrigin = existing;

if (publicOrigin) {
  console.log("发现已经运行的 ngrok：" + publicOrigin);
} else {
  console.log("正在连接固定 ngrok 隧道……");
  ngrok = spawn(
    ngrokCommand,
    [
      "http",
      port,
      "--log=stdout",
      "--log-format=logfmt",
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
  ngrok.on("exit", (code) => {
    if (!stopping) {
      console.error("ngrok 已退出（code=" + (code ?? "-") + "），同屏一起停止。");
      stopAll(code || 1);
    }
  });
  publicOrigin = await waitForNgrok(port, ngrok);
}

writePublicOrigin(envFile, publicOrigin);

if (tongping && configuredPublicOrigin !== publicOrigin) {
  console.log("固定公网地址发生变化，正在用正确地址重启本地同屏……");
  restartingTongping = true;
  await stopChild(tongping);
  restartingTongping = false;
  tongping = startTongping(publicOrigin);
}
if (!tongping) {
  console.log("正在启动同屏……");
  tongping = startTongping(publicOrigin);
}
await waitForTongping(port, tongping);

console.log("固定公网地址：" + publicOrigin);
console.log("ChatGPT / Claude 的 MCP 地址：" + publicOrigin + "/mcp");
console.log("同屏和固定隧道均已就绪（启动器 v106）。");
console.log("");

function startTongping(publicOrigin) {
  const child = spawn(process.execPath, [path.join(root, "scripts", "start.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      TONGPING_PUBLIC_ORIGIN: publicOrigin,
    },
    stdio: "inherit",
    windowsHide: false,
  });
  child.on("exit", (code) => {
    if (!stopping && !restartingTongping) stopAll(code || 1);
  });
  return child;
}

async function waitForTongping(targetPort, child) {
  const origin = "http://127.0.0.1:" + targetPort;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail("本地同屏没有启动成功。请查看上面的 [daemon] / [worker] 日志。");
    }
    try {
      const response = await fetch(origin + "/health", {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const health = await response.json().catch(() => null);
        if (health?.service === "tongping") return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  fail("60 秒内本地同屏没有通过健康检查。请把上面的日志发给 AI。");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  if (tongping && tongping.exitCode === null) tongping.kill("SIGTERM");
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

function normalizeOrigin(value) {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
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

async function endpointIsOffline(origin) {
  try {
    const response = await fetch(origin + "/health", {
      signal: AbortSignal.timeout(4_000),
    });
    return response.headers.get("ngrok-error-code") === "ERR_NGROK_3200";
  } catch {
    // A timeout or local upstream error does not prove the public endpoint is
    // gone. Only ngrok's explicit offline code is safe to clean automatically.
    return false;
  }
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
