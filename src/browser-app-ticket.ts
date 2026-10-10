import crypto from "node:crypto";

const PROFILE_RE = /^[a-zA-Z0-9._-]{1,64}$/;
const PURPOSE = "tongping-frame-v1";
const INPUT_PURPOSE = "tongping-input-v1";
const LIVE_PURPOSE = "tongping-live-v1";
const WATCH_COLLECTION_READ_PURPOSE = "tongping-watch-collection-read-v1";
const WATCH_COLLECTION_WRITE_PURPOSE = "tongping-watch-collection-write-v1";
const CONTROL_PURPOSE = "tongping-control-v1";
const IDENTITY_RE = /^[a-z0-9._-]{1,40}$/;

export function deriveBrowserAppSigningKey(token: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(PURPOSE)
    .update("\0")
    .update(token)
    .digest();
}

export function createBrowserFrameTicket(
  key: Buffer,
  profile: string,
  ttlSeconds = 45,
  nowMs = Date.now(),
): { exp: number; sig: string } {
  assertProfile(profile);
  const ttl = Math.max(5, Math.min(120, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  return { exp, sig: signature(key, profile, exp) };
}

export function verifyBrowserFrameTicket(
  key: Buffer,
  profile: string,
  expRaw: string | null,
  sigRaw: string | null,
  nowMs = Date.now(),
): boolean {
  if (!PROFILE_RE.test(profile) || !expRaw || !sigRaw) return false;
  if (!/^\d{1,12}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 180) return false;

  const expected = Buffer.from(signature(key, profile, exp));
  const supplied = Buffer.from(sigRaw);
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

export function createBrowserFrameUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 45,
): string {
  const { exp, sig } = createBrowserFrameTicket(
    key,
    profile,
    ttlSeconds,
  );
  const url = new URL("/v1/app/frame", publicOrigin);
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function createBrowserSingleFrameUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 45,
  source: "live" | "frame" = "live",
): string {
  const url = new URL(
    createBrowserFrameUrl(publicOrigin, key, profile, ttlSeconds),
  );
  url.searchParams.set("once", source);
  return url.toString();
}

function signature(key: Buffer, profile: string, exp: number): string {
  return crypto
    .createHmac("sha256", key)
    .update(PURPOSE)
    .update("\0")
    .update(profile)
    .update("\0")
    .update(String(exp))
    .digest("base64url");
}

function assertProfile(profile: string): void {
  if (!PROFILE_RE.test(profile)) {
    throw new Error("Invalid browser profile for frame ticket.");
  }
}


export function createBrowserInputUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  identity: string,
  ttlSeconds = 45,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  if (!IDENTITY_RE.test(identity)) {
    throw new Error("Invalid browser identity for input ticket.");
  }
  const ttl = Math.max(5, Math.min(120, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = inputSignature(key, profile, identity, exp);
  const url = new URL("/v1/app/pointer", publicOrigin);
  url.searchParams.set("profile", profile);
  url.searchParams.set("identity", identity);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function verifyBrowserInputTicket(
  key: Buffer,
  profile: string,
  identity: string,
  expRaw: string | null,
  sigRaw: string | null,
  nowMs = Date.now(),
): boolean {
  if (
    !PROFILE_RE.test(profile) ||
    !IDENTITY_RE.test(identity) ||
    !expRaw ||
    !sigRaw ||
    !/^\d{1,12}$/.test(expRaw)
  ) {
    return false;
  }
  const exp = Number(expRaw);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 180) {
    return false;
  }
  const expected = Buffer.from(
    inputSignature(key, profile, identity, exp)
  );
  const supplied = Buffer.from(sigRaw);
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

function inputSignature(
  key: Buffer,
  profile: string,
  identity: string,
  exp: number,
): string {
  return crypto
    .createHmac("sha256", key)
    .update(INPUT_PURPOSE)
    .update("\0")
    .update(profile)
    .update("\0")
    .update(identity)
    .update("\0")
    .update(String(exp))
    .digest("base64url");
}



export function createBrowserControlUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  identity: string,
  ttlSeconds = 45,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  if (!IDENTITY_RE.test(identity)) {
    throw new Error("Invalid browser identity for control ticket.");
  }
  const ttl = Math.max(5, Math.min(120, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = controlSignature(key, profile, identity, exp);
  const url = new URL("/v1/app/control", publicOrigin);
  url.searchParams.set("profile", profile);
  url.searchParams.set("identity", identity);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function verifyBrowserControlTicket(
  key: Buffer,
  profile: string,
  identity: string,
  expRaw: string | null,
  sigRaw: string | null,
  nowMs = Date.now(),
): boolean {
  if (
    !PROFILE_RE.test(profile) ||
    !IDENTITY_RE.test(identity) ||
    !expRaw ||
    !sigRaw ||
    !/^\d{1,12}$/.test(expRaw)
  ) {
    return false;
  }
  const exp = Number(expRaw);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 180) {
    return false;
  }
  const expected = Buffer.from(
    controlSignature(key, profile, identity, exp),
  );
  const supplied = Buffer.from(sigRaw);
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

function controlSignature(
  key: Buffer,
  profile: string,
  identity: string,
  exp: number,
): string {
  return crypto
    .createHmac("sha256", key)
    .update(CONTROL_PURPOSE)
    .update("\0")
    .update(profile)
    .update("\0")
    .update(identity)
    .update("\0")
    .update(String(exp))
    .digest("base64url");
}

export function createBrowserLiveUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 900,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = liveSignature(key, profile, exp);
  const url = new URL("/v1/app/live-ws", publicOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function createBrowserAudioUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 900,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = liveSignature(key, profile, exp);
  const url = new URL("/v1/app/audio-ws", publicOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function createBrowserMediaUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 900,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = liveSignature(key, profile, exp);
  const url = new URL("/v1/app/media-ws", publicOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function createBrowserCompanionHlsUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 900,
  delaySeconds = 30,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = liveSignature(key, profile, exp);
  const url = new URL("/v1/app/companion-hls", publicOrigin);
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  url.searchParams.set(
    "delay",
    String(Math.max(8, Math.min(90, Math.round(delaySeconds)))),
  );
  return url.toString();
}
export function createBrowserChatUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 3600,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = liveSignature(key, profile, exp);
  const url = new URL("/v1/app/chat", publicOrigin);
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}
export function createBrowserWatchCollectionUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 3600,
  nowMs = Date.now(),
): string {
  return createWatchCollectionUrl(publicOrigin, key, profile, "read", ttlSeconds, nowMs);
}

export function createBrowserWatchCollectionWriteUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 3600,
  nowMs = Date.now(),
): string {
  return createWatchCollectionUrl(publicOrigin, key, profile, "write", ttlSeconds, nowMs);
}

function createWatchCollectionUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  operation: "read" | "write",
  ttlSeconds: number,
  nowMs: number,
): string {
  const { exp, sig } = createBrowserWatchCollectionTicket(key, profile, operation, ttlSeconds, nowMs);
  const url = new URL("/v1/app/watch-collection", publicOrigin);
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}

export function createBrowserWatchCollectionTicket(
  key: Buffer,
  profile: string,
  operation: "read" | "write",
  ttlSeconds = 3600,
  nowMs = Date.now(),
): { exp: number; sig: string } {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  return { exp, sig: watchCollectionSignature(key, profile, operation, exp) };
}

export function verifyBrowserWatchCollectionTicket(
  key: Buffer,
  profile: string,
  operation: "read" | "write",
  expRaw: string | null,
  sigRaw: string | null,
  nowMs = Date.now(),
): boolean {
  if (!PROFILE_RE.test(profile) || !expRaw || !sigRaw || !/^\d{1,12}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 3600) return false;
  const expected = Buffer.from(watchCollectionSignature(key, profile, operation, exp));
  const supplied = Buffer.from(sigRaw);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function watchCollectionSignature(
  key: Buffer,
  profile: string,
  operation: "read" | "write",
  exp: number,
): string {
  return crypto.createHmac("sha256", key)
    .update(operation === "read" ? WATCH_COLLECTION_READ_PURPOSE : WATCH_COLLECTION_WRITE_PURPOSE)
    .update("\0").update(profile).update("\0").update(String(exp))
    .digest("base64url");
}



export function verifyBrowserLiveTicket(
  key: Buffer,
  profile: string,
  expRaw: string | null,
  sigRaw: string | null,
  nowMs = Date.now(),
): boolean {
  if (!PROFILE_RE.test(profile) || !expRaw || !sigRaw || !/^\d{1,12}$/.test(expRaw)) {
    return false;
  }
  const exp = Number(expRaw);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 3600) {
    return false;
  }
  const expected = Buffer.from(liveSignature(key, profile, exp));
  const supplied = Buffer.from(sigRaw);
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

function liveSignature(key: Buffer, profile: string, exp: number): string {
  return crypto
    .createHmac("sha256", key)
    .update(LIVE_PURPOSE)
    .update("\0")
    .update(profile)
    .update("\0")
    .update(String(exp))
    .digest("base64url");
}


export function createBrowserLiveWsUrl(
  publicOrigin: string,
  key: Buffer,
  profile: string,
  ttlSeconds = 900,
  nowMs = Date.now(),
): string {
  assertProfile(profile);
  const ttl = Math.max(30, Math.min(3600, Math.floor(ttlSeconds)));
  const exp = Math.floor(nowMs / 1000) + ttl;
  const sig = liveSignature(key, profile, exp);
  const url = new URL("/v1/app/live-ws", publicOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("profile", profile);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return url.toString();
}
