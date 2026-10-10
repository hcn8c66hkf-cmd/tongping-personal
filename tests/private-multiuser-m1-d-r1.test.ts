import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { SharedImageStore } from "../src/shared-images.js";
import { createSharedImageTicket, verifySharedImageTicket } from "../src/shared-image-ticket.js";
import { brandHumanUserId, ownerScope } from "../src/route-identity.js";

const a = ownerScope(brandHumanUserId("owner-a"));
const b = ownerScope(brandHumanUserId("owner-b"));
const key = randomBytes(32);
const signClaims = (claims: unknown) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", key).update("tongping-shared-image-v1").update("\0").update(payload).digest("base64url");
  return payload + "." + signature;
};

test("owner-scoped store keeps opaque images, mime, TTL and separate eviction", () => {
  let now = 1_000_000;
  const store = new SharedImageStore({ maxEntriesPerOwner: 2, now: () => now });
  const first = store.put(a, Buffer.from("A1"), "image/png");
  assert.match(first.id, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(store.get(a, first.id)?.buffer.toString(), "A1");
  assert.equal(store.get(a, first.id)?.mimeType, "image/png");
  assert.equal(store.get(b, first.id), null);
  const other = store.put(b, Buffer.from("B1"), "image/jpeg");
  store.put(a, Buffer.from("A2"), "image/jpeg");
  store.put(a, Buffer.from("A3"), "image/png");
  assert.equal(store.get(a, first.id), null);
  assert.equal(store.get(b, other.id)?.buffer.toString(), "B1");
  for (let i = 0; i < 8; i++) store.put(b, Buffer.from(String(i)), "image/png");
  assert.equal(store.get(a, first.id), null);
  const latestA = store.put(a, Buffer.from("A4"), "image/png");
  assert.equal(store.get(a, latestA.id)?.buffer.toString(), "A4");
  now += 30 * 60_000;
  assert.equal(store.get(a, latestA.id), null);
});

test("concurrent owner quota pressure never evicts another owner", async () => {
  const store = new SharedImageStore({ maxEntriesPerOwner: 2 });
  const anchor = store.put(a, Buffer.from("anchor"), "image/png");
  await Promise.all(Array.from({ length: 80 }, (_, i) => Promise.resolve().then(() =>
    store.put(b, Buffer.from(String(i)), "image/png"))));
  assert.equal(store.get(a, anchor.id)?.buffer.toString(), "anchor");
  assert.equal(store.count(a), 1);
  assert.equal(store.count(b), 2);
});

test("signed ticket binds owner, image id and expiry", () => {
  const now = 1_000_000;
  const store = new SharedImageStore({ now: () => now });
  const ar = store.put(a, Buffer.from("A"), "image/png");
  const br = store.put(b, Buffer.from("B"), "image/jpeg");
  const at = createSharedImageTicket(key, ar.id, a, ar.expiresAt, now);
  const bt = createSharedImageTicket(key, br.id, b, br.expiresAt, now);
  assert.equal(verifySharedImageTicket(key, at, ar.id, now)?.humanUserId, a.humanUserId);
  assert.equal(verifySharedImageTicket(key, bt, br.id, now)?.humanUserId, b.humanUserId);
  const bForA = createSharedImageTicket(key, ar.id, b, ar.expiresAt, now);
  assert.equal(store.get(verifySharedImageTicket(key, bForA, ar.id, now)!, ar.id), null);
  assert.equal(store.get(verifySharedImageTicket(key, at, ar.id, now)!, br.id), null);
  assert.equal(verifySharedImageTicket(key, at, br.id, now), null);
  assert.equal(verifySharedImageTicket(key, at, ar.id, ar.expiresAt), null);
  assert.equal(verifySharedImageTicket(key, at + "x", ar.id, now), null);
  assert.equal(verifySharedImageTicket(key, "bad", ar.id, now), null);
  const [payload, signature] = at.split(".");
  const modified = Buffer.from(JSON.stringify({ v: 1, i: ar.id, o: b.humanUserId, exp: Math.floor(ar.expiresAt / 1000) })).toString("base64url");
  assert.equal(verifySharedImageTicket(key, modified + "." + signature, ar.id, now), null);
  assert.equal(verifySharedImageTicket(key, signClaims({ v: 1, i: ar.id, o: a.humanUserId, exp: Math.floor(now / 1000) + 3600 }), ar.id, now), null);
  assert.equal(verifySharedImageTicket(key, signClaims({ v: 2, i: ar.id, o: a.humanUserId, exp: Math.floor(ar.expiresAt / 1000) }), ar.id, now), null);
  assert.equal(verifySharedImageTicket(key, signClaims({ v: 1, i: "bad", o: a.humanUserId, exp: Math.floor(ar.expiresAt / 1000) }), ar.id, now), null);
  assert.equal(verifySharedImageTicket(key, signClaims({ v: 1, i: ar.id, o: "", exp: Math.floor(ar.expiresAt / 1000) }), ar.id, now), null);
  assert.equal(verifySharedImageTicket(key, signClaims({ v: 1, i: ar.id, o: a.humanUserId, exp: "later" }), ar.id, now), null);
  assert.ok(payload);
});
