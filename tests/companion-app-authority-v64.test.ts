import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
const mcp = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
const hub = fs.readFileSync(new URL("../src/media-ws-hub.ts", import.meta.url), "utf8");

test("v64 media URL carries an App build generation without changing ticket authority", () => {
  assert.ok(app.includes("shared-browser-v101"));
  assert.ok(mcp.includes("stampBrowserAppBuildOnMediaUrl"));
  assert.ok(mcp.includes('url.searchParams.set("app_build", build)'));
  assert.ok(mcp.includes("createBrowserMediaUrl("));
});

test("App ready handshake announces its UI build", () => {
  assert.ok(app.includes('appUiBuild: state.appUiBuild || "v93"'));
  assert.ok(hub.includes("const announcedBuild = parseAppBuild(message.appUiBuild)"));
});

test("older or same-generation stale media viewers cannot replace current authority", () => {
  assert.ok(hub.includes("authority.build > current.build"));
  assert.ok(hub.includes("authority.build === current.build"));
  assert.ok(hub.includes("authority.exp > current.exp"));
  assert.ok(hub.includes('ws.close(1008, "stale media viewer")'));
  assert.ok(hub.includes('existing.close(1012, "newer media viewer")'));
});

test("media health exposes active App authority for diagnosis", () => {
  assert.ok(hub.includes("appAuthority: [...this.apps.entries()]"));
});
