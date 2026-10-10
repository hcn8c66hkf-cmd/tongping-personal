import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("../src/mcp-server.ts", import.meta.url), "utf8");
const shot = server.slice(server.indexOf('    "browser_screenshot",'));

test("screenshot defaults to the profile the user's card is showing", () => {
  assert.match(shot, /profile: z\.string\(\)\.default\(""\)/);
  assert.match(shot, /const profile = requestedProfile \|\| viewerProfile \|\| "default";/);
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
  assert.match(daemon, /getViewerProfile: \(\) =>\n          mediaWsHub\.appProfiles\(\)\[0\] \?\? liveWsHub\.appProfiles\(\)\[0\] \?\? null/);
});

test("an inactive profile is reported instead of launching a blank window", () => {
  assert.ok(shot.indexOf('gateway.call("browser_profiles", {})') < shot.indexOf('gateway.call("browser_screenshot"'));
  assert.match(shot, /userIsViewing: watching/);
});
