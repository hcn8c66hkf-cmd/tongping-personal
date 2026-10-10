import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MediaWsHub } from "../src/media-ws-hub.js";

type FakeWs = EventEmitter & {
  readyState: number;
  closedWith: string | null;
  close: (code?: number, reason?: string) => void;
};

function fakeWs(): FakeWs {
  const ws = new EventEmitter() as FakeWs;
  ws.readyState = 1;
  ws.closedWith = null;
  ws.close = (_code, reason) => {
    if (ws.readyState !== 1) return;
    ws.readyState = 3;
    ws.closedWith = reason ?? "";
    ws.emit("close");
  };
  return ws;
}

function setup() {
  const ready: string[] = [];
  const hub = new MediaWsHub({
    authenticateWorker: () => true,
    authenticateApp: () => true,
    onCompanionReady: (profile) => ready.push(profile),
  });
  const accept = (profile: string, exp: number) => {
    const ws = fakeWs();
    (hub as unknown as {
      acceptApp: (p: string, w: FakeWs, a: { build: number; exp: number }) => void;
    }).acceptApp(profile, ws, { build: 77, exp });
    ws.emit("message", Buffer.from(JSON.stringify({
      type: "companion_ready", appUiBuild: "v93",
    })), false);
    return ws;
  };
  return { hub, ready, accept };
}

test("a newer companion card on another profile evicts the older card", () => {
  const { hub, ready, accept } = setup();
  const oldCard = accept("default", 1_000);
  const newCard = accept("gpt-self", 2_000);
  assert.equal(oldCard.closedWith, "newer companion viewer");
  assert.equal(newCard.closedWith, null);
  assert.deepEqual(ready, ["default", "gpt-self"]);
  assert.deepEqual(hub.stats().companionAppProfiles, ["gpt-self"]);
  hub.close();
});

test("an older card reconnecting cannot take companion back", () => {
  const { hub, ready, accept } = setup();
  const newCard = accept("gpt-self", 2_000);
  const staleRetry = accept("default", 1_000);
  assert.equal(staleRetry.closedWith, "stale companion viewer");
  assert.equal(newCard.closedWith, null);
  assert.deepEqual(ready, ["gpt-self"]);
  assert.deepEqual(hub.stats().companionAppProfiles, ["gpt-self"]);
  hub.close();
});
