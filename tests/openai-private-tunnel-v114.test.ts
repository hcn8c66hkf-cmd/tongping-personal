import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const launcher = await readFile(
  new URL("../scripts/Start-OpenAI-Tunnel.ps1", import.meta.url),
  "utf8",
);
const commandFile = await readFile(
  new URL("../启动同屏和固定隧道.cmd", import.meta.url),
  "utf8",
);

test("v114 uses its dedicated OpenAI tunnel and never the other private tunnels", () => {
  assert.match(launcher, /tunnel_6afec118b3c4819190be0edaecf8df78/);
  assert.doesNotMatch(launcher, /tunnel_6ae9f1efa5708191949296c5a912f8d5/);
  assert.doesNotMatch(launcher, /tunnel_6a7b2f25e72c8191a5d247f5ca4db9f6/);
  assert.doesNotMatch(launcher, /tunnel_6aeb2db0519081919de5b004e1f5e4f4/);
});

test("v114 keeps secrets local and injects daemon authorization only on the localhost hop", () => {
  assert.match(launcher, /control-plane-key\.dpapi/);
  assert.match(launcher, /MCP_EXTRA_HEADERS/);
  assert.match(launcher, /Authorization: Bearer/);
  assert.match(launcher, /Join-Path \$TongPingHome 'daemon\\daemon-token'/);
  assert.doesNotMatch(launcher, /sk-[A-Za-z0-9_-]{20,}/);
  assert.match(launcher, /Get-DotEnvValue 'TONGPING_PORT'/);
  assert.match(launcher, /Get-DotEnvValue 'TONGPING_HOME'/);
});

test("v114 command launcher no longer requires or starts ngrok", () => {
  assert.match(commandFile, /Start-OpenAI-Tunnel\.ps1/);
  assert.doesNotMatch(commandFile, /start-ngrok|NGROK_BIN|ngrok\.exe/i);
  assert.match(commandFile, /启动器 v117/);
});

test("v114 refuses to kill a reused stale PID", () => {
  assert.match(launcher, /Get-CimInstance Win32_Process/);
  assert.match(launcher, /Ignored stale PID file/);
  assert.match(launcher, /ExpectedCommandFragment/);
});

test("v115 safely replaces an older TongPing instance that owns the daemon lock", () => {
  assert.ok(launcher.includes("function Stop-ExistingTongPing"));
  assert.ok(launcher.includes("'daemon\\daemon.lock'"));
  assert.ok(launcher.includes("src[\\\\/]daemon\\.ts"));
  assert.ok(launcher.includes("scripts[\\\\/]start\\.mjs"));
  assert.ok(launcher.includes('[\\s"\\\\/]'));
  assert.ok(launcher.includes("Stopping the previous TongPing instance safely"));
  assert.ok(launcher.includes("will not kill an unrelated process"));
  assert.ok(launcher.includes("Get-ProcessById $rootPid"));
  assert.match(launcher, /function Start-TongPing[\s\S]*Stop-ExistingTongPing[\s\S]*Stop-ProcessTreeFromFile/);
});

test("v116 resolves a configured-port collision before starting the relay", () => {
  assert.ok(launcher.includes("function Get-TcpListenerProcessIds"));
  assert.ok(launcher.includes("Get-NetTCPConnection -State Listen"));
  assert.ok(launcher.includes("function Stop-VerifiedTongPingProcessTree"));
  assert.ok(launcher.includes("function Reserve-FreeLocalPort"));
  assert.ok(launcher.includes("cannot be reserved; using and reserving free port"));
  assert.ok(launcher.includes("SetEnvironmentVariable('TONGPING_PORT'"));
  assert.match(launcher, /Stop-ExistingTongPing\s+Prepare-TongPingPort\s+Write-Step 'Starting the free short-lived media relay/);
});

test("v117 reserves the selected port across relay startup and releases it only for Node", () => {
  assert.ok(launcher.includes("function New-LocalPortReservation"));
  assert.ok(launcher.includes("[Net.Sockets.TcpListener]::new"));
  assert.ok(launcher.includes("ExclusiveAddressUse = $true"));
  assert.ok(launcher.includes("function Reserve-FreeLocalPort"));
  assert.ok(launcher.includes("using and reserving free port"));
  assert.match(launcher, /function Start-TongPing[\s\S]*PortReservation\.Stop\(\)[\s\S]*Start-Process -FilePath 'node\.exe'/);
  assert.match(launcher, /finally \{[\s\S]*PortReservation\.Stop\(\)[\s\S]*Stop-ManagedTunnel/);
});

test("v114 uses an ephemeral media relay without binding the plugin to it", () => {
  assert.ok(launcher.includes("trycloudflare"));
  assert.match(launcher, /TONGPING_PUBLIC_ORIGIN/);
  assert.match(launcher, /--mcp-server-url/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:/);
});
