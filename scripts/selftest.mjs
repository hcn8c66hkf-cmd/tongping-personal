#!/usr/bin/env node
// 同屏 TongPing 个人版 自检：在 `npm run up` 已经运行的前提下，
// 通过真正的 MCP 协议把三件事各走一遍：
//   1. 逛网页：打开一个页面并读出标题和正文
//   2. 看视频：打开一个带 <video> 的页面，读媒体状态（播放时间在走）
//   3. 聊天：AI 发群聊 → 另一个 AI 读到；人类从卡片发消息 → AI 读到
// 用法：npm run selftest            （默认连 http://127.0.0.1:45921）
//       npm run selftest -- --video https://example.com/some-video-page
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import WebSocket from "ws";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
loadEnvFile(path.join(root, ".env"));
const port = process.env.TONGPING_PORT?.trim() || "45921";
const base = (process.env.TONGPING_SELFTEST_URL?.trim() || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
const home = path.resolve(expandHome(process.env.TONGPING_HOME?.trim() || path.join(os.homedir(), ".tongping")));
const tokenFile = path.join(home, "daemon", "daemon-token");
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PAGE_URL = argValue("--page", "https://example.com/");
// A 5-second CC0 clip from MDN (reachable from mainland China); Chrome autoplays a direct .mp4.
const VIDEO_URL = argValue("--video", "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4");
const PROFILE = argValue("--profile", "selftest");

if (!existsSync(tokenFile)) {
  fail(`找不到 daemon 令牌 ${tokenFile}。先运行 npm run up，并确认 TONGPING_HOME 和启动时一致。`);
}
const token = readFileSync(tokenFile, "utf8").trim();
let sessionId = "";
let rpcId = 0;
const results = [];

async function rpc(method, params, { notify = false } = {}) {
  const body = { jsonrpc: "2.0", method, params };
  if (!notify) body.id = ++rpcId;
  const response = await fetch(base + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  sessionId = response.headers.get("mcp-session-id") || sessionId;
  if (notify) return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 300)}`);
  const json = text.trim().startsWith("{")
    ? JSON.parse(text)
    : JSON.parse(text.split("\n").filter((l) => l.startsWith("data:")).pop().slice(5));
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function tool(name, toolArgs) {
  const result = await rpc("tools/call", { name, arguments: toolArgs });
  const text = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  if (result.isError) throw new Error(`${name}: ${text.slice(0, 400)}`);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return { result, text, json: parsed ?? result.structuredContent ?? null };
}

async function step(label, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ label, ok: true, detail, ms: Date.now() - started });
    console.log(`✅ ${label}  ${detail ?? ""}`);
  } catch (error) {
    results.push({ label, ok: false, detail: String(error?.message ?? error), ms: Date.now() - started });
    console.log(`❌ ${label}  ${String(error?.message ?? error).slice(0, 500)}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`同屏自检 → ${base}  (profile=${PROFILE})\n`);

await step("health：daemon 在线，worker 已连接", async () => {
  const health = await (await fetch(base + "/health")).json();
  if (!health.ok) throw new Error("health.ok=false");
  if (!health.worker?.connected) throw new Error("worker 没连上：npm run up 的窗口里看 [worker] 开头的报错");
  return `workerBuild=${health.workerBuild}`;
});

await step("MCP 握手 + 工具列表", async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "tongping-selftest", version: "1" },
  });
  await rpc("notifications/initialized", {}, { notify: true });
  const list = await rpc("tools/list", {});
  const names = list.tools.map((t) => t.name);
  for (const must of ["browser_open", "browser_read", "browser_app", "browser_app_chat_push", "browser_app_room_read"]) {
    if (!names.includes(must)) throw new Error("缺少工具 " + must);
  }
  return `${init.serverInfo?.name} · ${names.length} 个工具`;
});

await step("逛网页：打开页面并读正文", async () => {
  // A Chrome launch can stall once (antivirus scan, leftover process).
  // Retry a single time before calling it a failure.
  try {
    await tool("browser_open", { profile: PROFILE, url: PAGE_URL });
  } catch (error) {
    if (!/did not answer in time|Timeout \d+ms exceeded/.test(String(error?.message))) throw error;
    console.log("   …启动浏览器超时，自动重试一次");
    await sleep(5_000);
    await tool("browser_open", { profile: PROFILE, url: PAGE_URL });
  }
  const read = await tool("browser_read", { profile: PROFILE });
  const blob = read.text;
  if (!/Example Domain|example/i.test(blob) && PAGE_URL.includes("example.com")) {
    throw new Error("没读到 example.com 的正文：" + blob.slice(0, 200));
  }
  return `读到 ${blob.length} 字符`;
});

await step("看视频：打开带视频的页面，读播放状态", async () => {
  await tool("browser_open", { profile: PROFILE, url: VIDEO_URL });
  await sleep(1_000);
  // Start playback the way a user would: a real click on the video element.
  const snap = await tool("browser_snapshot", { profile: PROFILE });
  const first = await tool("browser_media_context", { profile: PROFILE, lookbackSeconds: 30, maxCues: 5 });
  const media = findMedia(first.json);
  if (!media) throw new Error("页面上没找到可读的 <video>：" + first.text.slice(0, 300));
  if (media.paused !== false) {
    // Autoplay is often blocked; press play through the page itself.
    const ref = findVideoRef(snap.json);
    if (ref) await tool("browser_click", { profile: PROFILE, ref }).catch(() => {});
    else await tool("browser_press", { profile: PROFILE, key: "k" }).catch(() => {});
    await sleep(3_000);
  }
  const t1 = findMedia((await tool("browser_media_context", { profile: PROFILE, lookbackSeconds: 30, maxCues: 5 })).json);
  await sleep(1_500);
  const t2 = findMedia((await tool("browser_media_context", { profile: PROFILE, lookbackSeconds: 30, maxCues: 5 })).json);
  const advanced = t1 && t2 && Number(t2.currentTime) > Number(t1.currentTime);
  const finished = t2 && Number(t2.currentTime) > 0 && Number(t2.duration) > 0 &&
    Number(t2.currentTime) >= Number(t2.duration) - 0.25;
  if (finished && !advanced) return `短片已完整播放（${Number(t2.duration).toFixed(1)}s）`;
  if (!advanced) {
    throw new Error(`视频播放时间没有前进 (${t1?.currentTime} → ${t2?.currentTime}, paused=${t2?.paused})`);
  }
  return `currentTime ${Number(t1.currentTime).toFixed(1)}s → ${Number(t2.currentTime).toFixed(1)}s，时长 ${t2.duration ?? "?"}s`;
});

await step("看视频：截一帧画面", async () => {
  const shot = await rpc("tools/call", { name: "browser_screenshot", arguments: { profile: PROFILE } });
  const image = (shot.content ?? []).find((c) => c.type === "image");
  if (!image) throw new Error("截图结果里没有图片");
  return `JPEG/PNG base64 ${image.data.length} 字符`;
});

let ticket = null;
let liveUrl = null;
let mediaUrl = null;
let hlsUrl = null;
await step("打开同屏卡片（拿到卡片票据）", async () => {
  const app = await tool("browser_app", { profile: PROFILE, identity: "claude.code" });
  ticket = findChatTicket(app.result);
  liveUrl = findUrl(app.result, /\/v1\/app\/live-ws\?/);
  mediaUrl = findUrl(app.result, /\/v1\/app\/media-ws\?/);
  hlsUrl = findUrl(app.result, /\/v1\/app\/companion-hls\?/);
  if (!ticket) throw new Error("browser_app 结果里没找到 chat 票据");
  if (!liveUrl) throw new Error("browser_app 结果里没找到 live-ws 地址（worker 版本太旧？）");
  return "ok";
});

await step("看视频：卡片实时画面（WebSocket 连续收帧）", async () => {
  if (!liveUrl) throw new Error("上一步没拿到 live-ws 地址");
  await tool("browser_open", { profile: PROFILE, url: VIDEO_URL });
  const stats = await new Promise((resolve, reject) => {
    const ws = new WebSocket(liveUrl, { headers: { origin: base } });
    let frames = 0, bytes = 0;
    const timer = setTimeout(() => { ws.close(); resolve({ frames, bytes }); }, 6_000);
    ws.on("message", (data, isBinary) => {
      if (!isBinary) return;
      frames++; bytes += data.length;
      // Same flow control as the card: acknowledge each presented frame.
      ws.send(JSON.stringify({ type: "frame_ready", outcome: "presented", presentedAt: Date.now() }));
    });
    ws.on("error", (error) => { clearTimeout(timer); reject(error); });
    ws.on("close", (code) => { if (frames === 0 && code !== 1005) { clearTimeout(timer); reject(new Error("live-ws 关闭 code=" + code)); } });
  });
  if (stats.frames < 5) throw new Error(`6 秒只收到 ${stats.frames} 帧（正常应 ≥5）`);
  return `6 秒收到 ${stats.frames} 帧，${Math.round(stats.bytes / 1024)} KB`;
});

const hasFfmpeg = (() => {
  try { return spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0; } catch { return false; }
})();
if (!hasFfmpeg) {
  console.log("⏭️  陪看：跳过（本机没有 ffmpeg；装好后重开终端再跑自检即可测这一项）");
} else {
  await step("看视频：陪看缓冲出片（ffmpeg → HLS）", async () => {
    if (!mediaUrl || !hlsUrl) throw new Error("browser_app 结果里没找到陪看地址");
    await tool("browser_open", { profile: PROFILE, url: VIDEO_URL });
    const ws = new WebSocket(mediaUrl, { headers: { origin: base } });
    await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    ws.send(JSON.stringify({ type: "companion_ready" }));
    const playlistUrl = new URL(hlsUrl);
    playlistUrl.searchParams.set("delay", "8");
    let playlist = "";
    const deadline = Date.now() + 60_000;
    try {
      while (Date.now() < deadline) {
        await sleep(2_000);
        // The sample clip is only 5 s; replay it so the recorder keeps getting
        // moving frames (a still page buffers far slower than real time).
        const media = findMedia((await tool("browser_media_context", { profile: PROFILE, lookbackSeconds: 5, maxCues: 1 })).json);
        if (media && (media.ended || media.paused || Number(media.currentTime) >= Number(media.duration) - 0.3)) {
          const ref = findVideoRef((await tool("browser_snapshot", { profile: PROFILE })).json);
          if (ref) await tool("browser_click", { profile: PROFILE, ref }).catch(() => {});
        }
        playlist = await (await fetch(playlistUrl)).text();
        if ((playlist.match(/\.m4s/g) || []).length >= 2) break;
      }
      const segments = (playlist.match(/\.m4s/g) || []).length;
      if (segments < 2) {
        const buffered = /#TONGPING-BUFFERED-SECONDS:([0-9.]+)/.exec(playlist)?.[1];
        throw new Error(`60 秒内没有出片（缓冲 ${buffered ?? "?"} 秒）。看 npm run doctor 的 companion 项`);
      }
      const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist)?.[1];
      if (!init) throw new Error("播放列表里没有 init 分片");
      const initResponse = await fetch(new URL(init, playlistUrl));
      if (!initResponse.ok) throw new Error(`init 分片取不到 HTTP ${initResponse.status}`);
      const bytes = (await initResponse.arrayBuffer()).byteLength;
      return `${segments} 个分片，init ${bytes} 字节`;
    } finally {
      ws.close();
    }
  });
}

await step("聊天：AI 发言 → 另一个 AI 读到", async () => {
  const marker = "selftest-" + Date.now().toString(36);
  await tool("browser_app_chat_push", { identity: "claude.code", profile: PROFILE, text: "你好，我是自检里的 Claude。" + marker });
  const read = await tool("browser_app_room_read", { identity: "gpt.chat", limit: 50 });
  const hit = (read.json?.unread ?? []).find((m) => String(m.text).includes(marker));
  if (!hit) throw new Error("gpt.chat 没读到 claude.code 的消息");
  return `gpt.chat 读到 seq=${hit.seq} from=${hit.from}`;
});

await step("聊天：人在卡片里发消息 → AI 读到", async () => {
  if (!ticket) throw new Error("上一步没拿到票据");
  const marker = "human-" + Date.now().toString(36);
  const url = new URL(ticket);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "（自检）人类说：在吗？" + marker, clientId: marker }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`卡片发消息失败 HTTP ${response.status} ${body.slice(0, 200)}`);
  await sleep(300);
  const read = await tool("browser_app_room_read", { identity: "claude.code", limit: 50 });
  const hit = (read.json?.unread ?? []).find((m) => String(m.text).includes(marker));
  if (!hit) throw new Error("claude.code 没读到人类消息");
  return `claude.code 读到 from=${hit.from}`;
});

await step("收尾：关闭自检用的浏览器页面", async () => {
  await tool("browser_close_profile", { profile: PROFILE }).catch(() => {});
  return "ok";
});

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(failed.length ? `自检结束：${failed.length} 项失败（把上面整段贴给 AI，并让它读 docs/TROUBLESHOOTING.md）` : "自检全部通过 🎉");
process.exit(failed.length ? 1 : 0);

function findMedia(value) {
  let found = null;
  walk(value, (node) => {
    if (!found && node && typeof node === "object" && "currentTime" in node && ("paused" in node || "duration" in node)) found = node;
  });
  return found;
}

function findVideoRef(value) {
  let ref = null;
  walk(value, (node) => {
    if (!ref && node && typeof node === "object" && typeof node.ref === "string") {
      const tag = String(node.tag ?? node.role ?? node.kind ?? "").toLowerCase();
      if (tag.includes("video")) ref = node.ref;
    }
  });
  return ref;
}

function findUrl(value, pattern) {
  let url = null;
  walk(value, (node) => { if (!url && typeof node === "string" && pattern.test(node) && /^wss?:|^https?:/.test(node)) url = node; });
  return url;
}

function findChatTicket(value) {
  let url = null;
  walk(value, (node) => {
    if (!url && typeof node === "string" && /\/v1\/app\/chat\?/.test(node)) url = node;
  });
  if (url) return url.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:"));
  return null;
}

function walk(value, visit, depth = 0) {
  if (depth > 40) return;
  visit(value);
  if (typeof value === "string" && value.length > 2 && (value[0] === "{" || value[0] === "[")) {
    try { walk(JSON.parse(value), visit, depth + 1); } catch {}
    return;
  }
  if (Array.isArray(value)) for (const item of value) walk(item, visit, depth + 1);
  else if (value && typeof value === "object") for (const key of Object.keys(value)) walk(value[key], visit, depth + 1);
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) process.env[key] = value;
  }
}

function expandHome(value) {
  return value === "~" || value.startsWith("~/") || value.startsWith("~\\") ? path.join(os.homedir(), value.slice(1)) : value;
}

function fail(message) {
  console.error("错误：" + message);
  process.exit(1);
}
