import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");

test("five skins with candy as the default, applied before first paint of controls", () => {
  for (const skin of ["candy", "mist", "sage", "dusk", "night"]) {
    assert.match(app, new RegExp(':root\\[data-skin="' + skin + '"\\]'));
  }
  assert.match(app, /:root,:root\[data-skin="candy"\]\{/);
  assert.match(app, /applySkin\(readPref\("tongping-skin"\) \|\| "candy", false\);/);
});

test("the dock leads with companion; remote controls live in a drawer that opens on takeover", () => {
  const dock = app.slice(app.indexOf('<div class="dock">'), app.indexOf('<section class="drawer"'));
  assert.ok(dock.indexOf('id="companion"') < dock.indexOf('id="companionPause"'));
  assert.ok(dock.includes('id="showToAi"') && dock.includes('id="watchTicket"'));
  const drawer = app.slice(app.indexOf('<section class="drawer"'), app.indexOf('<div class="chatPanel"'));
  for (const id of ["address", "open", "back", "forward", "refresh", "bookmarkAdd", "takeover", "humanText", "remotePad"]) {
    assert.ok(drawer.includes('id="' + id + '"'), id);
  }
  assert.match(app, /if \(takeover && !lastRenderedTakeover && !remoteDrawerOpen\) setRemoteDrawer\(true\);/);
});

test("rarely used controls move into the menu, every original control id still exists once", () => {
  const menu = app.slice(app.indexOf('<div class="menuSheet"'), app.indexOf('<div class="skinToast"'));
  for (const id of ["identity", "profile", "localLogin", "fullscreen", "controlBadge", "appVersion"]) {
    assert.ok(menu.includes('id="' + id + '"'), id);
  }
  const body = app.slice(app.indexOf("<body>"), app.indexOf("</body>"));
  for (const id of ["companion", "companionPause", "showToAi", "watchTicket", "takeover", "localLogin", "sound", "enter", "esc", "typeText", "modeStatus", "companionTimeline", "mediaVideo"]) {
    assert.equal(body.split('id="' + id + '"').length - 1, 1, id);
  }
});

test("bookmarks and prefs are per-device conveniences guarded against blocked storage", () => {
  assert.match(app, /function readPref\(key\) \{\n  try \{ return localStorage\.getItem\(key\); \} catch \{ return null; \}/);
  assert.match(app, /function toggleCurrentBookmark\(\)/);
  assert.match(app, /url: "https:\/\/www\.douyin\.com\/jingxuan"/);
  // render() may run before the chrome block initialises.
  assert.match(app, /if \(!Array\.isArray\(bookmarks\) \|\| !\$\("remoteDrawer"\)\) return;/);
});
