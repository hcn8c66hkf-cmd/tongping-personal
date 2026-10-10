import { createHmac, timingSafeEqual } from "node:crypto";
import { brandHumanUserId, ownerScope, type OwnerScope } from "./route-identity.js";
import { SHARED_IMAGE_TTL_MS } from "./shared-images.js";

const PURPOSE = "tongping-shared-image-v1";
const ID = /^[A-Za-z0-9_-]{24}$/;
const TOKEN = /^([A-Za-z0-9_-]{20,512})\.([A-Za-z0-9_-]{43})$/;

export function createSharedImageTicket(
  key: Buffer, id: string, owner: OwnerScope, imageExpiresAt: number, nowMs = Date.now(),
): string {
  if (!ID.test(id) || !owner.humanUserId || !Number.isSafeInteger(imageExpiresAt) ||
    imageExpiresAt <= nowMs || imageExpiresAt > nowMs + SHARED_IMAGE_TTL_MS) throw new Error("Invalid shared image ticket claims");
  const payload = Buffer.from(JSON.stringify({ v: 1, i: id, o: owner.humanUserId, exp: Math.floor(imageExpiresAt / 1000) })).toString("base64url");
  return payload + "." + sign(key, payload);
}

export function verifySharedImageTicket(key: Buffer, token: string | null, expectedId: string, nowMs = Date.now()): OwnerScope | null {
  if (!token || !ID.test(expectedId)) return null;
  const match = TOKEN.exec(token);
  if (!match) return null;
  const [, payload, signature] = match;
  const supplied = Buffer.from(signature!, "base64url");
  const expected = Buffer.from(sign(key, payload!), "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let claim: unknown;
  try { claim = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")); } catch { return null; }
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
  const value = claim as Record<string, unknown>;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (value.v !== 1 || value.i !== expectedId || typeof value.o !== "string" || !value.o ||
    !Number.isSafeInteger(value.exp) || (value.exp as number) <= nowSeconds ||
    (value.exp as number) > nowSeconds + Math.ceil(SHARED_IMAGE_TTL_MS / 1000)) return null;
  return ownerScope(brandHumanUserId(value.o));
}

function sign(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(PURPOSE).update("\0").update(payload).digest("base64url");
}
