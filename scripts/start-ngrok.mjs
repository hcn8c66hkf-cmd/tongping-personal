#!/usr/bin/env node
// One-click public startup:
//   1. Start the account-bound ngrok HTTPS endpoint.
//   2. Discover its public URL from ngrok's local API.
//   3. Persist only TONGPING_PUBLIC_ORIGIN in .env.
//   4. Start TongPing with that origin already in the process environment.
// Ctrl+C stops both TongPing and ngrok.
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
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
let recoveringTongping = false;

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

const configuredPublicOrigin = normalizeOrigin(env.TONGPING_PUBLIC_ORIGIN);
await clearStaleLocalTongping(port, 0);
const testPauseAfterPreflight = Number(
  process.env.TONGPING_TEST_PAUSE_AFTER_PREFLIGHT_MS || "0",
);
const testPreflightMarker =
  process.env.TONGPING_TEST_PREFLIGHT_MARKER?.trim() || "";
if (testPreflightMarker) {
  writeFileSync(testPreflightMarker, "ready", "utf8");
}
if (Number.isFinite(testPauseAfterPreflight) && testPauseAfterPreflight > 0) {
  await new Promise((resolve) => setTimeout(resolve, testPauseAfterPreflight));
}
if (configuredPublicOrigin) {
  console.log("正在先启动本地同屏……");
  tongping = await startTongpingReady(configuredPublicOrigin);
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
  tongping = await startTongpingReady(publicOrigin);
}
if (!tongping) {
  console.log("正在启动同屏……");
  tongping = await startTongpingReady(publicOrigin);
}

console.log("固定公网地址：" + publicOrigin);
console.log("ChatGPT / Claude 的 MCP 地址：" + publicOrigin + "/mcp");
console.log("同屏和固定隧道均已就绪（启动器 v108）。");
console.log("");

async function clearStaleLocalTongping(targetPort, waitForHealthMs = 0) {
  if (!/^\d+$/.test(String(targetPort))) {
    fail("TONGPING_PORT 必须是数字端口。");
  }

  const origin = "http://127.0.0.1:" + targetPort;
  let health = null;
  const healthDeadline = Date.now() + waitForHealthMs;
  do {
    try {
      const response = await fetch(origin + "/health", {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) health = await response.json().catch(() => null);
    } catch {}
    if (health?.service === "tongping" || Date.now() >= healthDeadline) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (true);

  if (health?.service === "tongping") {
    if (process.platform !== "win32") {
      fail("发现已有同屏占用端口 " + targetPort + "。请先关闭旧同屏再重试。");
    }

    console.log("发现上一轮同屏仍占用端口，正在安全清理……");
    const owner = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-NetTCPConnection -LocalPort " + targetPort +
          " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    const pid = Number(String(owner.stdout || "").trim());
    if (!Number.isInteger(pid) || pid <= 0) {
      fail("确认是旧同屏占用，但没有取得它的进程编号。请把日志发给 AI。");
    }
    const killed = spawnSync("taskkill", ["/F", "/PID", String(pid)], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (killed.status !== 0) {
      fail("旧同屏进程无法自动关闭。请把日志发给 AI。");
    }
    await waitForPortFree(targetPort, 12_000);
    console.log("旧同屏已清理，端口已释放。");
    return;
  }

  if (await isPortOpen(targetPort)) {
    fail(
      "端口 " + targetPort +
        " 被其他程序占用。启动器没有关闭它；请把日志发给 AI。",
    );
  }
}

async function waitForPortFree(targetPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(targetPort))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("旧同屏退出后，端口 " + targetPort + " 仍未释放。请把日志发给 AI。");
}

function isPortOpen(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: Number(targetPort),
    });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function startTongpingReady(publicOrigin) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    recoveringTongping = true;
    const child = startTongping(publicOrigin);
    const ready = await waitForTongping(port, child);
    if (ready) {
      recoveringTongping = false;
      return child;
    }

    console.log("检测到启动途中端口碰撞，正在等待旧同屏退出并自动重试……");
    await clearStaleLocalTongping(port, 5_000);
  }

  recoveringTongping = false;
  fail("本地同屏重试后仍未启动成功。请把上面的日志发给 AI。");
}

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
    if (!stopping && !restartingTongping && !recoveringTongping) stopAll(code || 1);
  });
  return child;
}

async function waitForTongping(targetPort, child) {
  const origin = "http://127.0.0.1:" + targetPort;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return false;
    }
    try {
      const response = await fetch(origin + "/health", {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const health = await response.json().catch(() => null);
        if (health?.service === "tongping") return true;
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
