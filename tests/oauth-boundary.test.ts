import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TongpingOAuthService } from "../src/oauth-service.js";

async function fixture(trustedProxyAddresses: string[] = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-oauth-boundary-"));
  let currentMs = 1_800_000_000_000;
  let oauth: TongpingOAuthService;
  const server = createServer(async (request, response) => {
    const handled = await oauth.handle(request, response, new URL(request.url ?? "/", "http://127.0.0.1"));
    if (!handled) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  oauth = new TongpingOAuthService(origin, "synthetic-owner-password", path.join(root, "oauth-store.json"), () => currentMs, trustedProxyAddresses);
  await oauth.init();
  return { origin, advance: (ms: number) => { currentMs += ms; }, close: async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  } };
}

test("DCR rejects unsafe redirect schemes and preserves HTTPS and loopback HTTP", async () => {
  const f = await fixture();
  try {
    for (const redirect of ["javascript:alert(1)", "data:text/plain,x", "file:///tmp/callback", "http://example.test/callback", "https://user:pass@example.test/callback", "https://example.test/callback#frag"]) {
      const response = await fetch(f.origin + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect] }) });
      assert.equal(response.status, 400, redirect);
    }
    for (const redirect of ["https://claude.ai/callback", "https://chatgpt.com/callback", "http://127.0.0.1:49152/callback", "http://[::1]:49152/callback", "http://localhost:49152/callback"]) {
      const response = await fetch(f.origin + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect] }) });
      assert.equal(response.status, 201, redirect);
    }
  } finally { await f.close(); }
});

test("password failures are source bounded and spoofed forwarding headers do not evade the limit", async () => {
  const f = await fixture();
  try {
    const params = new URLSearchParams({ client_id: "synthetic", redirect_uri: "https://example.test/callback", code_challenge: "synthetic", _pw: "wrong" });
    for (let index = 0; index < 10; index++) {
      const response = await fetch(f.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `192.0.2.${index + 1}` }, body: params });
      assert.equal(response.status, 401);
    }
    const blocked = await fetch(f.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.20" }, body: params });
    assert.equal(blocked.status, 429);
    assert(Number(blocked.headers.get("retry-after")) > 0);
    f.advance(10 * 60_000 + 1);
    const released = await fetch(f.origin + "/oauth/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
    assert.equal(released.status, 401);
  } finally { await f.close(); }
});

test("a configured local proxy isolates failed passwords by forwarded client", async () => {
  const f = await fixture(["127.0.0.1"]);
  try {
    const params = new URLSearchParams({ client_id: "synthetic", redirect_uri: "https://example.test/callback", code_challenge: "synthetic", _pw: "wrong" });
    const attempt = (ip: string) => fetch(f.origin + "/oauth/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
      body: params,
    });
    for (let index = 0; index < 10; index++) {
      assert.equal((await attempt("198.51.100.10")).status, 401);
    }
    assert.equal((await attempt("198.51.100.10")).status, 429);
    assert.equal((await attempt("203.0.113.20")).status, 401);
  } finally { await f.close(); }
});

test("normal DCR, PKCE and token exchange work without Origin", async () => {
  const f = await fixture();
  try {
    const redirect = "https://claude.ai/callback";
    const reg = await fetch(f.origin + "/oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect] }) });
    assert.equal(reg.status, 201);
    const client = await reg.json() as { client_id: string };
    const verifier = "synthetic-verifier-012345678901234567890123456789";
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const auth = await fetch(f.origin + "/oauth/authorize", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
      client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "synthetic-state", _pw: "synthetic-owner-password",
    }) });
    assert.equal(auth.status, 302);
    const code = new URL(auth.headers.get("location")!).searchParams.get("code");
    assert(code);
    const token = await fetch(f.origin + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirect }) });
    assert.equal(token.status, 200);
    const credentials = await token.json() as { access_token: string; refresh_token: string };
    assert(credentials.access_token && credentials.refresh_token);
    const refreshed = await fetch(f.origin + "/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: credentials.refresh_token }) });
    assert.equal(refreshed.status, 200);
  } finally { await f.close(); }
});
