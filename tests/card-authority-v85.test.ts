import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { admitCard, registerCardSocket, resetCardAuthorityForTests } from "../src/card-authority.js";

test("only the newest card keeps live/media sockets; older cards are closed and refused", () => {
  resetCardAuthorityForTests();
  // Unstamped (older app) sockets are fine until a stamped card shows up.
  assert.equal(admitCard(0), true);
  let oldClosed = 0;
  registerCardSocket(0, () => { oldClosed += 1; });
  assert.equal(admitCard(1000), true);
  assert.equal(oldClosed, 1);
  let firstClosed = 0;
  registerCardSocket(1000, () => { firstClosed += 1; });
  // Same card reconnecting is fine; an older one is refused.
  assert.equal(admitCard(1000), true);
  assert.equal(admitCard(999), false);
  assert.equal(admitCard(0), false);
  assert.equal(admitCard(2000), true);
  assert.equal(firstClosed, 1);
  resetCardAuthorityForTests();
});

test("the app stamps its live and media sockets with the card's birth time", () => {
  const app = fs.readFileSync(new URL("../src/browser-app.ts", import.meta.url), "utf8");
  assert.match(app, /new WebSocket\(withCardStamp\(state\.liveUrl\)\)/);
  assert.match(app, /new WebSocket\(withCardStamp\(state\.mediaUrl\)\)/);
  for (const hub of ["live-ws-hub.ts", "media-ws-hub.ts"]) {
    const text = fs.readFileSync(new URL("../src/" + hub, import.meta.url), "utf8");
    assert.match(text, /!admitCard\(card(, [^)]*)?\)/);
  }
});

test("a closed newest card releases authority after the grace window", () => {
  resetCardAuthorityForTests();
  const t0 = 1_000_000;
  assert.equal(admitCard(1000, t0), true);
  const releaseOld = registerCardSocket(1000, () => {});
  assert.equal(admitCard(2000, t0 + 10), true);
  const releaseNew = registerCardSocket(2000, () => {});
  releaseOld();
  // Newest card goes away (tab closed). During the reconnect grace the
  // older card is still refused...
  releaseNew();
  assert.equal(admitCard(1000, Date.now() + 1_000), false);
  // ...but afterwards it can take the live/media lanes back.
  assert.equal(admitCard(1000, Date.now() + 25_000), true);
  resetCardAuthorityForTests();
});

test("hosted card scopes never outrank each other", () => {
  resetCardAuthorityForTests();
  let closedA = false;
  assert.equal(admitCard(1_000, 1_000, "userA"), true);
  registerCardSocket(1_000, () => { closedA = true; }, "userA");
  // A newer card in another scope must not close or refuse userA's card.
  assert.equal(admitCard(2_000, 1_001, "userB"), true);
  assert.equal(closedA, false);
  assert.equal(admitCard(1_000, 1_002, "userA"), true);
  // Within the same scope the newest card still wins.
  assert.equal(admitCard(3_000, 1_003, "userA"), true);
  assert.equal(closedA, true);
});
