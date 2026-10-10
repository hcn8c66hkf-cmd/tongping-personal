/**
 * Batch 1 hosted AI-delegation configuration and frozen numerical limits.
 *
 * Every value in HOSTED_AI_LIMITS comes from the Architecture packet section 7
 * and is frozen, not tunable. Tests may shorten *budgets* (timeouts) through a
 * bounded seam, but production maxima must never increase.
 */

export type HostedAiScope =
  | "browser.read"
  | "browser.navigate"
  | "browser.interact";

export const HOSTED_AI_SCOPES: readonly HostedAiScope[] = [
  "browser.read",
  "browser.navigate",
  "browser.interact",
];

export const HOSTED_AI_LIMITS = Object.freeze({
  // Consent requests / codes
  consentRequestTtlSeconds: 600,
  consentRequestsPerClient: 8,
  consentRequestsGlobal: 512,
  authorizeRatePerMinutePerIp: 30,
  authCodeTtlSeconds: 60,
  // Tokens / grants
  accessTokenTtlSeconds: 900,
  refreshTokenIdleTtlSeconds: 86_400,
  grantDefaultDurationSeconds: 86_400,
  grantMaxDurationSeconds: 604_800,
  grantRouteLimit: 8,
  activeGrantsPerHuman: 8,
  // DCR
  dcrBodyBytes: 8 * 1024,
  dcrRedirectUriLimit: 5,
  dcrRedirectUriChars: 512,
  dcrClientNameChars: 80,
  dcrClientsMax: 5_000,
  dcrUnusedPruneSeconds: 86_400,
  dcrPerHourPerIp: 10,
  dcrPerHourGlobal: 200,
  // Token endpoint
  tokenBodyBytes: 4 * 1024,
  tokenPerMinutePerIp: 60,
  tokenFailuresPerFiveMinutes: 10,
  // Human API
  humanBodyBytes: 4 * 1024,
  humanPerMinutePerHuman: 20,
  // MCP
  mcpBodyBytes: 64 * 1024,
  admittedMcpGlobal: 128,
  admittedMcpPerOwner: 16,
  admittedMcpPerGrant: 4,
  toolCallsPerMinutePerGrant: 60,
  toolCallBurstPerGrant: 10,
  toolCallsPerMinutePerOwner: 240,
  // Command broker
  pendingCommandsPerRoute: 2,
  pendingCommandsPerGrant: 4,
  pendingCommandsPerOwner: 16,
  pendingCommandsPerGeneration: 16,
  pendingCommandsGlobal: 1024,
  commandEnvelopeBytes: 8 * 1024,
  workerResultBytes: 512 * 1024,
  workerScreenshotResultBytes: 2_621_440, // 2.5 MiB
  mcpResponseBytes: 256 * 1024,
  mcpScreenshotResponseBytes: 2_306_867, // 2.2 MiB, screenshot only
  heldResultBytesPerOwner: 8 * 1024 * 1024,
  heldResultBytesGlobal: 32 * 1024 * 1024,
  // Budgets (per-request deadlines)
  budgetAuthMs: 2_000,
  budgetRouteMs: 3_000,
  budgetAdmissionMs: 1_000,
  budgetBodyMs: 2_000,
  budgetPreEnqueueMs: 8_000,
  // Poll / sweeps
  workerPollWaitSeconds: 20,
  commandSweepMs: 1_000,
  authoritySweepMs: 5_000,
  authoritySweepBatch: 256,
  dbPurgeIntervalMs: 600_000,
  dbPurgeBatch: 1_000,
  // Resident records
  residentGrants: 1_024,
  residentTombstones: 4_096,
  tombstoneTtlSeconds: 120,
  residentRequests: 1_024,
  residentCommands: 1_024,
  residentDispatchers: 1_024,
  residentWaiters: 1_024,
  residentRateBuckets: 8_192,
  // Retention
  retentionAuthRequestSeconds: 3_600,
  retentionExpiredTokenSeconds: 86_400,
  retentionEventSeconds: 30 * 86_400,
  // DB pools
  aiReadPoolMax: 8,
  aiReadTimeoutMs: 2_000,
  oauthWritePoolMax: 4,
  oauthWriteTimeoutMs: 3_000,
  // Screenshot raw bytes (viewport only)
  screenshotRawBytes: 1_572_864, // 1.5 MiB
});

/** One process-wide bounded budget shared by every hosted AI rate window. */
export class HostedAiRateBuckets {
  private readonly entries = new Map<string, { scope: number; expiresAt: number; count: number }>();
  private nextScope = 0;
  namespace(): number { return ++this.nextScope; }
  observation() { return { buckets: this.entries.size }; }
  allow(scope: number, key: string, windowMs: number, limit: number, now: number): boolean {
    const identity = scope + ":" + key;
    const entry = this.entries.get(identity);
    if (entry && now < entry.expiresAt) {
      if (entry.count >= limit) return false;
      entry.count += 1;
      return true;
    }
    if (!entry && this.entries.size >= HOSTED_AI_LIMITS.residentRateBuckets) {
      // Bounded scan; expired entries only. Live principals are never evicted.
      for (const [id, value] of this.entries) {
        if (now >= value.expiresAt) this.entries.delete(id);
      }
      if (this.entries.size >= HOSTED_AI_LIMITS.residentRateBuckets) return false;
    }
    this.entries.set(identity, { scope, expiresAt: now + windowMs, count: 1 });
    return true;
  }
  release(scope: number): void {
    for (const [key, entry] of this.entries) if (entry.scope === scope) this.entries.delete(key);
  }
}

export interface HostedAiStaticClient {
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  readonly scopes: readonly HostedAiScope[];
}

export interface HostedAiConfig {
  readonly publicUrl: string;
  readonly resourceUrl: string;
  readonly consentUrl: string;
  readonly redirectHostAllowlist: readonly string[];
  readonly hostAllowlist: readonly string[];
  readonly originAllowlist: readonly string[];
  readonly allowLoopbackRedirects: boolean;
  readonly staticClients: readonly HostedAiStaticClient[];
  readonly scopesSupported: readonly HostedAiScope[];
}

export class HostedAiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedAiConfigError";
  }
}

export function loadHostedAiConfig(
  environment: NodeJS.ProcessEnv,
): HostedAiConfig {
  const publicUrl = strictHttpsUrl(
    required(environment.TONGPING_HOSTED_AI_PUBLIC_URL),
    "hosted AI public URL",
  );
  const consentUrl = strictHttpsUrl(
    required(environment.TONGPING_HOSTED_AI_CONSENT_URL),
    "hosted AI consent URL",
  ).toString();
  const redirectHostAllowlist = csv(
    required(environment.TONGPING_HOSTED_AI_REDIRECT_HOSTS),
  );
  const hostAllowlist = csv(
    required(environment.TONGPING_HOSTED_AI_HOST_ALLOWLIST),
  );
  const originAllowlist = csv(
    required(environment.TONGPING_HOSTED_AI_ORIGIN_ALLOWLIST),
  ).map((origin) => strictOrigin(origin));
  const allowLoopbackRedirects =
    environment.TONGPING_HOSTED_AI_DEV_LOOPBACK === "1";
  const staticClients = parseStaticClients(
    environment.TONGPING_HOSTED_AI_STATIC_CLIENTS_JSON,
  );

  return validateHostedAiConfig({
    publicUrl: trimTrailingSlash(publicUrl),
    resourceUrl: trimTrailingSlash(publicUrl) + "/v1/mcp",
    consentUrl,
    redirectHostAllowlist,
    hostAllowlist,
    originAllowlist,
    allowLoopbackRedirects,
    staticClients,
    scopesSupported: HOSTED_AI_SCOPES,
  });
}

export function validateHostedAiConfig(config: HostedAiConfig): HostedAiConfig {
  strictHttpsUrl(config.publicUrl, "hosted AI public URL");
  strictHttpsUrl(config.consentUrl, "hosted AI consent URL");
  if (config.redirectHostAllowlist.length === 0) {
    throw new HostedAiConfigError("redirect host allowlist must not be empty");
  }
  if (config.hostAllowlist.length === 0) {
    throw new HostedAiConfigError("Host allowlist must not be empty");
  }
  if (config.originAllowlist.length === 0) {
    throw new HostedAiConfigError("Origin allowlist must not be empty");
  }
  for (const host of config.hostAllowlist) {
    if (host !== host.toLowerCase() || /[/\\@\s]/.test(host)) {
      throw new HostedAiConfigError("Host allowlist entries must be lowercase host[:port]");
    }
  }
  for (const client of config.staticClients) {
    if (!/^[A-Za-z0-9._~-]{8,128}$/.test(client.clientId)) {
      throw new HostedAiConfigError("static client_id is invalid");
    }
    if (client.redirectUris.length < 1 || client.redirectUris.length > HOSTED_AI_LIMITS.dcrRedirectUriLimit) {
      throw new HostedAiConfigError("static client redirect URI count is invalid");
    }
    if (client.clientName.length > HOSTED_AI_LIMITS.dcrClientNameChars) {
      throw new HostedAiConfigError("static client name is too long");
    }
    for (const scope of client.scopes) {
      if (!HOSTED_AI_SCOPES.includes(scope)) {
        throw new HostedAiConfigError("static client scope is unsupported");
      }
    }
  }
  return Object.freeze({
    ...config,
    redirectHostAllowlist: Object.freeze([...config.redirectHostAllowlist]),
    hostAllowlist: Object.freeze([...config.hostAllowlist]),
    originAllowlist: Object.freeze([...config.originAllowlist]),
    staticClients: Object.freeze(
      config.staticClients.map((client) =>
        Object.freeze({
          ...client,
          redirectUris: Object.freeze([...client.redirectUris]),
          scopes: Object.freeze([...client.scopes]),
        }),
      ),
    ),
    scopesSupported: Object.freeze([...config.scopesSupported]),
  });
}

export function isHostAllowed(config: HostedAiConfig, host: string | undefined): boolean {
  if (typeof host !== "string" || host.length === 0) return false;
  return config.hostAllowlist.includes(host.toLowerCase());
}

export function isOriginAllowed(
  config: HostedAiConfig,
  origin: string | undefined,
): boolean {
  if (origin === undefined) return true;
  if (origin === "null") return false;
  return config.originAllowlist.includes(origin.toLowerCase());
}

export function isRedirectUriAllowed(
  config: HostedAiConfig,
  raw: string,
): boolean {
  if (raw.length === 0 || raw.length > HOSTED_AI_LIMITS.dcrRedirectUriChars) {
    return false;
  }
  let uri: URL;
  try {
    uri = new URL(raw);
  } catch {
    return false;
  }
  if (uri.username || uri.password || uri.hash) return false;
  if (uri.protocol === "https:") {
    if (config.redirectHostAllowlist.includes(uri.host.toLowerCase())) {
      return true;
    }
    return uri.port === "" &&
      config.redirectHostAllowlist.includes(uri.hostname.toLowerCase());
  }
  if (uri.protocol === "http:" && config.allowLoopbackRedirects) {
    const loopback =
      uri.hostname === "127.0.0.1" ||
      uri.hostname === "[::1]" ||
      uri.hostname.toLowerCase() === "localhost";
    return loopback && config.redirectHostAllowlist.includes(uri.host.toLowerCase());
  }
  return false;
}

function parseStaticClients(
  raw: string | undefined,
): readonly HostedAiStaticClient[] {
  const value = raw?.trim();
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new HostedAiConfigError("static client configuration is not JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new HostedAiConfigError("static client configuration must be an array");
  }
  if (parsed.length > 128) {
    throw new HostedAiConfigError("too many static clients configured");
  }
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new HostedAiConfigError("static client entry must be an object");
    }
    const record = entry as Record<string, unknown>;
    const redirectUris = Array.isArray(record.redirect_uris)
      ? record.redirect_uris.filter((x): x is string => typeof x === "string")
      : [];
    const scopes = Array.isArray(record.scopes)
      ? (record.scopes.filter((x): x is string =>
          typeof x === "string",
        ) as HostedAiScope[])
      : [...HOSTED_AI_SCOPES];
    return Object.freeze({
      clientId: requiredString(record.client_id, "static client_id"),
      clientName: requiredString(record.client_name, "static client_name"),
      redirectUris: Object.freeze(redirectUris),
      scopes: Object.freeze(scopes),
    });
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HostedAiConfigError(`${label} is required`);
  }
  return value.trim();
}

function strictHttpsUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HostedAiConfigError(`${label} must be a valid URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new HostedAiConfigError(
      `${label} must use HTTPS without embedded credentials or fragment`,
    );
  }
  return parsed;
}

function strictOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HostedAiConfigError("Origin allowlist entry is not a URL");
  }
  if (
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new HostedAiConfigError("Origin allowlist entry must be a bare origin");
  }
  return parsed.origin.toLowerCase();
}

function csv(value: string): string[] {
  return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];
}

function required(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new HostedAiConfigError("required hosted AI configuration is missing");
  return normalized;
}

function trimTrailingSlash(value: URL): string {
  return value.toString().replace(/\/+$/, "");
}
