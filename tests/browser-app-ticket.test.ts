import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserControlUrl,
  createBrowserFrameTicket,
  createBrowserFrameUrl,
  createBrowserSingleFrameUrl,
  createBrowserInputUrl,
  createBrowserLiveUrl,
  deriveBrowserAppSigningKey,
  verifyBrowserControlTicket,
  verifyBrowserFrameTicket,
  verifyBrowserInputTicket,
  verifyBrowserLiveTicket,
} from "../src/browser-app-ticket.js";

test("frame ticket is profile-bound and expires", () => {
  const key = deriveBrowserAppSigningKey("daemon-secret-for-test");
  const now = 1_800_000_000_000;
  const ticket = createBrowserFrameTicket(key, "xiaohongshu", 30, now);

  assert.equal(
    verifyBrowserFrameTicket(
      key,
      "xiaohongshu",
      String(ticket.exp),
      ticket.sig,
      now + 10_000,
    ),
    true,
  );
  assert.equal(
    verifyBrowserFrameTicket(
      key,
      "douyin",
      String(ticket.exp),
      ticket.sig,
      now + 10_000,
    ),
    false,
  );
  assert.equal(
    verifyBrowserFrameTicket(
      key,
      "xiaohongshu",
      String(ticket.exp),
      ticket.sig,
      now + 31_000,
    ),
    false,
  );
});

test("signed frame URL contains no daemon credential", () => {
  const secret = "never-ship-this-daemon-token";
  const key = deriveBrowserAppSigningKey(secret);
  const url = createBrowserFrameUrl(
    "https://browser.example.test",
    key,
    "default",
    45,
  );

  assert.match(url, /^https:\/\/browser\.example\.test\/v1\/app\/frame\?/);
  assert.match(url, /profile=default/);
  assert.match(url, /exp=/);
  assert.match(url, /sig=/);
  assert.equal(url.includes(secret), false);
});


test("input ticket is profile and identity bound", () => {
  const secret = "input-ticket-secret";
  const key = deriveBrowserAppSigningKey(secret);
  const url = new URL(
    createBrowserInputUrl(
      "https://browser.example.test",
      key,
      "default",
      "gpt",
      45,
      1_800_000_000_000,
    ),
  );

  assert.equal(
    verifyBrowserInputTicket(
      key,
      "default",
      "gpt",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      1_800_000_010_000,
    ),
    true,
  );
  assert.equal(
    verifyBrowserInputTicket(
      key,
      "default",
      "claude",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      1_800_000_010_000,
    ),
    false,
  );
  assert.equal(url.toString().includes(secret), false);
});


test("live ticket is profile-bound, long-lived, and credential-free", () => {
  const secret = "live-ticket-secret";
  const key = deriveBrowserAppSigningKey(secret);
  const now = 1_800_000_000_000;
  const url = new URL(
    createBrowserLiveUrl(
      "https://browser.example.test",
      key,
      "default",
      900,
      now,
    ),
  );

  assert.equal(url.pathname, "/v1/app/live-ws");
  assert.equal(url.protocol, "wss:");
  assert.equal(url.searchParams.get("profile"), "default");
  assert.equal(url.toString().includes(secret), false);
  assert.equal(
    verifyBrowserLiveTicket(
      key,
      "default",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      now + 120_000,
    ),
    true,
  );
  assert.equal(
    verifyBrowserLiveTicket(
      key,
      "douyin",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      now + 120_000,
    ),
    false,
  );
  assert.equal(
    verifyBrowserLiveTicket(
      key,
      "default",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      now + 901_000,
    ),
    false,
  );
});


test("control ticket is profile and identity bound", () => {
  const secret = "control-ticket-secret";
  const key = deriveBrowserAppSigningKey(secret);
  const now = 1_800_000_000_000;
  const url = new URL(
    createBrowserControlUrl(
      "https://browser.example.test",
      key,
      "default",
      "gpt",
      45,
      now,
    ),
  );

  assert.equal(url.pathname, "/v1/app/control");
  assert.equal(url.searchParams.get("profile"), "default");
  assert.equal(url.searchParams.get("identity"), "gpt");
  assert.equal(url.toString().includes(secret), false);
  assert.equal(
    verifyBrowserControlTicket(
      key,
      "default",
      "gpt",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      now + 10_000,
    ),
    true,
  );
  assert.equal(
    verifyBrowserControlTicket(
      key,
      "default",
      "claude",
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
      now + 10_000,
    ),
    false,
  );
});

test("single frame URL selects a finite source without exposing credentials", () => {
  const secret = "single-frame-secret";
  const key = deriveBrowserAppSigningKey(secret);
  const live = new URL(
    createBrowserSingleFrameUrl(
      "https://browser.example.test",
      key,
      "default",
      45,
      "live",
    ),
  );
  const frame = new URL(
    createBrowserSingleFrameUrl(
      "https://browser.example.test",
      key,
      "default",
      45,
      "frame",
    ),
  );

  assert.equal(live.pathname, "/v1/app/frame");
  assert.equal(live.searchParams.get("once"), "live");
  assert.equal(frame.searchParams.get("once"), "frame");
  assert.equal(live.toString().includes(secret), false);
});
