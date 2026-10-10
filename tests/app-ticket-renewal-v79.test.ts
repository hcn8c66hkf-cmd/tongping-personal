import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name: string) =>
  fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("refresh re-signs every long-lived lane, but only for cards that keep sockets across rotation", () => {
  const server = read("mcp-server.ts");
  const refresh = server.slice(server.indexOf('"browser_app_refresh",'));
  assert.match(refresh, /appUiBuild: z\.string\(\)\.max\(16\)\.optional\(\)/);
  assert.match(refresh, /Number\(buildMatch\[1\]\) >= 79/);
  for (const lane of ["liveUrl", "audioUrl", "mediaUrl", "companionHlsUrl", "chatUrl", "watchCollectionUrl", "controlUrl"]) {
    assert.match(refresh.slice(0, 5000), new RegExp(lane + ": "));
  }
});

test("the app ignores ticket rotation on healthy sockets and retries a failed live lane", () => {
  const app = read("browser-app.ts");
  assert.match(app, /actorArgs\(\{ appUiBuild: state\.appUiBuild \|\| "v93" \}\)/);
  assert.match(app, /stableSignedSocketTarget\(liveSocketUrl\) ===\s*stableSignedSocketTarget\(state\.liveUrl\)/);
  assert.match(app, /stableSignedSocketTarget\(mediaSocketUrl\) ===\s*stableSignedSocketTarget\(state\.mediaUrl\)/);
  assert.match(app, /if \(rotated && liveFailed\) \{/);
});
