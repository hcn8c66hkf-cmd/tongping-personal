// Site risk policy (Xiaohongshu, Douyin): a per-profile/site mutation budget shared by every model
// client, plus a fail-closed freeze when a site shows a risk-control page.
// It never paces, disguises or retries actions, and never applies to direct
// human input. See docs/2026-09-27-xiaohongshu-risk-control-interaction-pacing.md.

export type MutationClass = "light" | "content" | "heavy";

export type SiteRiskState =
  | "clear"
  | "login_required"
  | "verification_required"
  | "temporary_restriction"
  | "write_rejected"
  | "unknown_block";

const FREEZING_STATES = new Set<SiteRiskState>([
  "verification_required",
  "temporary_restriction",
  "write_rejected",
  "unknown_block",
]);

export interface PageObservation {
  url: string;
  title: string;
  // Text of dialogs, toasts and verification overlays only.
  overlayText: string;
  // Leading body text; used only when the whole page is short (a block page).
  bodyText: string;
  bodyLength: number;
  // A visible captcha container or verification iframe, whose text is not readable.
  captchaElement?: boolean;
}

export interface MutationTarget {
  text?: string;
  visibleText?: string;
  ariaLabel?: string;
  title?: string;
  dataE2E?: string;
  href?: string;
  role?: string;
  tag?: string;
  type?: string;
  hint?: string;
}

export interface BudgetWindow {
  windowMs: number;
  max: number;
}

export interface ClassBudget {
  minIntervalMs: number;
  windows: BudgetWindow[];
}

export type SiteBudgets = Record<MutationClass, ClassBudget>;

export interface SiteDefinition {
  id: string;
  hosts: string[];
  budgets: SiteBudgets;
  detect(observation: PageObservation): SiteRiskState;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Conservative starting values, not tuned from observed limits.
// Override with TONGPING_SITE_RISK_BUDGETS (see loadSiteBudgetOverrides).
export const DEFAULT_BUDGETS: SiteBudgets = {
  light: {
    minIntervalMs: 3_000,
    windows: [
      { windowMs: 10 * MINUTE, max: 20 },
      { windowMs: HOUR, max: 60 },
    ],
  },
  content: {
    minIntervalMs: 30_000,
    windows: [
      { windowMs: 10 * MINUTE, max: 5 },
      { windowMs: HOUR, max: 15 },
    ],
  },
  heavy: {
    minIntervalMs: 10 * MINUTE,
    windows: [
      { windowMs: HOUR, max: 2 },
      { windowMs: 24 * HOUR, max: 5 },
    ],
  },
};

export function detectXiaohongshuRisk(observation: PageObservation): SiteRiskState {
  const url = parseHttpUrl(observation.url);
  if (!url) return "clear";
  const pathAndQuery = `${url.pathname}${url.search}`;

  if (/\/website-login\/captcha|\/captcha|[?&/]verify/i.test(pathAndQuery)) {
    return "verification_required";
  }
  if (/\/website-login\/error/i.test(pathAndQuery)) return "unknown_block";

  return detectCommonRisk(observation, /^\/(login|website-login)(\/|$)/i.test(pathAndQuery));
}

export function detectDouyinRisk(observation: PageObservation): SiteRiskState {
  const url = parseHttpUrl(observation.url);
  if (!url) return "clear";
  const host = url.hostname.toLowerCase();

  if (/(^|\.)verify\./.test(host) || /\/verifycenter|\/captcha/i.test(url.pathname)) {
    return "verification_required";
  }

  return detectCommonRisk(observation, /^\/login(\/|$)/i.test(url.pathname));
}

// Text markers shared by Chinese content platforms. Only dialogs, toasts,
// the title and short (block) pages are searched, never long page content.
function detectCommonRisk(observation: PageObservation, loginPath: boolean): SiteRiskState {
  if (observation.captchaElement) return "verification_required";

  const shortPage = observation.bodyLength < 800;
  const scoped = [
    observation.title,
    observation.overlayText,
    shortPage ? observation.bodyText : "",
  ].join("\n");

  if (/Sorry,?\s*This Page Isn.t Available Right Now/i.test(scoped)) {
    return "unknown_block";
  }
  // Plain "验证码" is left out: the normal SMS login dialog shows it.
  if (/安全验证|请完成.{0,4}验证|完成验证后|验证码中间页|滑块|拖动.{0,6}完成|人机验证|图形验证|captcha/i.test(scoped)) {
    return "verification_required";
  }
  if (
    /(操作|访问|请求)(过于|太)?频繁|休息一下再|账号(存在)?(异常|风险)|账号已被(限制|封禁)|功能(暂时)?(被)?限制|暂时无法使用/.test(
      scoped,
    )
  ) {
    return "temporary_restriction";
  }
  if (/(评论|发送|发布|点赞|收藏|关注)失败|内容违规|违反社区/.test(scoped)) {
    return "write_rejected";
  }
  if (
    loginPath ||
    /获取验证码|扫码登录|手机号登录|验证码登录|登录后(查看|评论|才能|即可)/.test(observation.overlayText)
  ) {
    return "login_required";
  }
  return "clear";
}

function parseHttpUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const SITES: SiteDefinition[] = [
  {
    id: "xiaohongshu",
    hosts: ["xiaohongshu.com", "xhslink.com"],
    budgets: DEFAULT_BUDGETS,
    detect: detectXiaohongshuRisk,
  },
  {
    id: "douyin",
    hosts: ["douyin.com", "iesdouyin.com"],
    budgets: DEFAULT_BUDGETS,
    detect: detectDouyinRisk,
  },
];

// Model actions that can change account state; blocked while a site is frozen.
export const SITE_RISK_ACTIVATION_ACTIONS = new Set([
  "browser_click",
  "browser_double_click",
  "browser_type",
  "browser_press",
  "browser_select",
  "browser_set_files",
]);

// Actions after which the page is checked for a risk-control state.
export const SITE_RISK_OBSERVED_ACTIONS = new Set([
  ...SITE_RISK_ACTIVATION_ACTIONS,
  "browser_open",
  "browser_back",
  "browser_forward",
  "browser_reload",
]);

const HEAVY_PATTERN = /发布|发表|publish|删除|delete|编辑笔记/i;
const CONTENT_PATTERN = /发送|提交|send|submit/i;
const LIGHT_PATTERN = /点赞|赞|收藏|关注|like|digg|collect|favou?rite|follow/i;
const SEARCH_PATTERN = /search|搜索/i;

export function classifyMutation(
  action: string,
  target?: MutationTarget,
  options: { key?: string } = {},
): MutationClass | undefined {
  if (action === "browser_set_files") return "heavy";
  if (!target) return undefined;

  const href = (target.href ?? "").trim();
  const isNavigationLink =
    href !== "" && href !== "#" && !/^javascript:/i.test(href);
  const hint = target.hint ?? "";

  if (action === "browser_press") {
    if (options.key !== "Enter") return undefined;
    const editable =
      target.tag === "textarea" ||
      (target.tag === "input" && target.type !== "search") ||
      target.role === "textbox" ||
      /editable|editor|textarea|input/i.test(hint);
    const search = SEARCH_PATTERN.test(
      [target.type, target.ariaLabel, target.title, target.dataE2E, hint].join(" "),
    );
    return editable && !search ? "content" : undefined;
  }

  if (action !== "browser_click" && action !== "browser_double_click") {
    return undefined;
  }
  if (isNavigationLink) return undefined;

  // Long visible text means a card or container, not a single control.
  const shortText = (target.visibleText ?? "").length <= 20;
  const label = [
    target.ariaLabel,
    target.title,
    target.dataE2E,
    shortText ? target.text : "",
    shortText ? target.visibleText : "",
    hint,
  ].join(" ");

  if (HEAVY_PATTERN.test(label)) return "heavy";
  if (CONTENT_PATTERN.test(label)) return "content";
  if (LIGHT_PATTERN.test(label)) return "light";
  return undefined;
}

export type SiteRiskErrorCode = "site_risk_cooldown" | "site_risk_human_required";

export class SiteRiskBlockedError extends Error {
  constructor(
    readonly code: SiteRiskErrorCode,
    readonly site: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "SiteRiskBlockedError";
  }
}

export interface SiteFreeze {
  site: string;
  state: SiteRiskState;
  since: string;
  action: string;
  client: string;
}

export interface SiteRiskPolicyOptions {
  sites?: SiteDefinition[];
  now?: () => number;
}

export class SiteRiskPolicy {
  private readonly sites: SiteDefinition[];
  private readonly now: () => number;
  private readonly events = new Map<string, number[]>();
  private readonly freezes = new Map<string, SiteFreeze>();

  constructor(options: SiteRiskPolicyOptions = {}) {
    this.sites = options.sites ?? SITES;
    this.now = options.now ?? Date.now;
  }

  siteForUrl(url: string): SiteDefinition | undefined {
    let host: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
      host = parsed.hostname.toLowerCase();
    } catch {
      return undefined;
    }
    return this.sites.find((site) =>
      site.hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)),
    );
  }

  // Records the observed page state. Returns the new freeze when this
  // observation froze the site, otherwise undefined.
  observe(
    profile: string,
    site: SiteDefinition,
    observation: PageObservation,
    context: { action: string; client: string },
  ): { state: SiteRiskState; frozeNow?: SiteFreeze } {
    const state = site.detect(observation);
    if (!FREEZING_STATES.has(state)) return { state };
    const key = freezeKey(profile, site.id);
    if (this.freezes.has(key)) return { state };
    const freeze: SiteFreeze = {
      site: site.id,
      state,
      since: new Date(this.now()).toISOString(),
      action: context.action,
      client: context.client,
    };
    this.freezes.set(key, freeze);
    return { state, frozeNow: freeze };
  }

  assertMutationAllowed(profile: string, site: SiteDefinition, state: SiteRiskState): void {
    const freeze = this.freezes.get(freezeKey(profile, site.id));
    if (freeze) {
      throw new SiteRiskBlockedError(
        "site_risk_human_required",
        site.id,
        `site_risk_human_required: ${site.id} showed ${freeze.state} on profile ${profile} at ${freeze.since}. Model write actions on ${site.id} are stopped for this profile. Reading, snapshots and screenshots still work. Ask the user to take over, resolve it in the visible browser, and end takeover on the ${site.id} page. Do not retry.`,
      );
    }
    if (state === "login_required") {
      throw new SiteRiskBlockedError(
        "site_risk_human_required",
        site.id,
        `site_risk_human_required: ${site.id} requires login on profile ${profile}. Ask the user to log in through human takeover. Do not retry.`,
      );
    }
  }

  // Counts one mutation attempt against the shared budget, or throws a
  // cooldown without recording anything.
  consume(profile: string, site: SiteDefinition, mutation: MutationClass): void {
    const now = this.now();
    const budget = site.budgets[mutation];
    const key = `${freezeKey(profile, site.id)}\u0000${mutation}`;
    const longest = Math.max(budget.minIntervalMs, ...budget.windows.map((item) => item.windowMs));
    const events = (this.events.get(key) ?? []).filter((at) => now - at < longest);

    let retryAfterMs = 0;
    let reason = "";
    const last = events.at(-1);
    if (last !== undefined && now - last < budget.minIntervalMs) {
      retryAfterMs = budget.minIntervalMs - (now - last);
      reason = `at most one ${mutation} write every ${Math.round(budget.minIntervalMs / 1000)}s`;
    }
    for (const window of budget.windows) {
      const inWindow = events.filter((at) => now - at < window.windowMs);
      if (inWindow.length >= window.max) {
        const oldest = inWindow[inWindow.length - window.max] ?? now;
        const wait = window.windowMs - (now - oldest);
        if (wait > retryAfterMs) {
          retryAfterMs = wait;
          reason = `${window.max} ${mutation} writes per ${formatDuration(window.windowMs)}`;
        }
      }
    }

    if (retryAfterMs > 0) {
      this.events.set(key, events);
      const seconds = Math.ceil(retryAfterMs / 1000);
      throw new SiteRiskBlockedError(
        "site_risk_cooldown",
        site.id,
        `site_risk_cooldown: ${site.id} ${mutation} write budget for profile ${profile} is used up (${reason}, shared by all AI clients). Retry after ${seconds}s. Do not loop on retries.`,
        retryAfterMs,
      );
    }

    events.push(now);
    this.events.set(key, events);
  }

  // Lifts a freeze only when the current page on that site reads clear.
  clearIfResolved(profile: string, site: SiteDefinition, observation: PageObservation): SiteFreeze | undefined {
    const key = freezeKey(profile, site.id);
    const freeze = this.freezes.get(key);
    if (!freeze) return undefined;
    if (site.detect(observation) !== "clear") return undefined;
    this.freezes.delete(key);
    return freeze;
  }

  status(profile: string): Array<{
    site: string;
    frozen: boolean;
    freeze?: SiteFreeze;
    used: Record<MutationClass, number>;
  }> {
    const now = this.now();
    return this.sites.map((site) => {
      const freeze = this.freezes.get(freezeKey(profile, site.id));
      const used = {} as Record<MutationClass, number>;
      for (const mutation of ["light", "content", "heavy"] as const) {
        const hour = (this.events.get(`${freezeKey(profile, site.id)}\u0000${mutation}`) ?? [])
          .filter((at) => now - at < HOUR);
        used[mutation] = hour.length;
      }
      return { site: site.id, frozen: Boolean(freeze), freeze, used };
    });
  }
}

// Collected inside the page. Kept free of closures over Node values.
export function collectPageObservationInPage(): Omit<PageObservation, "url" | "title"> {
  const overlaySelector = [
    "[role='dialog']",
    "[role='alert']",
    "[aria-modal='true']",
    "[class*='toast' i]",
    "[class*='captcha' i]",
    "[class*='verify' i]",
    "[class*='modal' i]",
    "[class*='notice' i]",
  ].join(",");
  const overlayParts: string[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(overlaySelector)).slice(0, 20)) {
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    if (text) overlayParts.push(text.slice(0, 400));
  }
  const body = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  return {
    overlayText: overlayParts.join("\n").slice(0, 4000),
    bodyText: body.slice(0, 1200),
    bodyLength: body.length,
    captchaElement: Array.from(
      document.querySelectorAll<HTMLElement>(
        "#captcha_container,.captcha_verify_container,[id^='captcha-verify'],iframe[src*='verifycenter'],iframe[src*='captcha']",
      ),
    ).some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 40 && rect.height > 40 && getComputedStyle(element).visibility !== "hidden";
    }),
  };
}

export function loadSiteBudgetOverrides(
  raw: string | undefined,
  sites: SiteDefinition[] = SITES,
): SiteDefinition[] {
  if (!raw?.trim()) return sites;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[site-risk] TONGPING_SITE_RISK_BUDGETS is not valid JSON; using defaults.");
    return sites;
  }
  if (!parsed || typeof parsed !== "object") return sites;
  return sites.map((site) => {
    const override = (parsed as Record<string, unknown>)[site.id];
    if (!override || typeof override !== "object") return site;
    const budgets = { ...site.budgets };
    for (const mutation of ["light", "content", "heavy"] as const) {
      const value = (override as Record<string, unknown>)[mutation];
      const budget = parseClassBudget(value);
      if (budget) budgets[mutation] = budget;
      else if (value !== undefined) {
        console.error(`[site-risk] Ignoring invalid ${site.id}.${mutation} budget override.`);
      }
    }
    return { ...site, budgets };
  });
}

function parseClassBudget(value: unknown): ClassBudget | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const minIntervalMs = record.minIntervalMs;
  const windows = record.windows;
  if (!isBoundedInt(minIntervalMs, 0, 7 * 24 * HOUR) || !Array.isArray(windows) || windows.length < 1) {
    return undefined;
  }
  const parsed: BudgetWindow[] = [];
  for (const item of windows) {
    if (!item || typeof item !== "object") return undefined;
    const { windowMs, max } = item as Record<string, unknown>;
    if (!isBoundedInt(windowMs, 1_000, 7 * 24 * HOUR) || !isBoundedInt(max, 1, 10_000)) {
      return undefined;
    }
    parsed.push({ windowMs, max });
  }
  return { minIntervalMs, windows: parsed };
}

function isBoundedInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function freezeKey(profile: string, site: string): string {
  return `${profile}\u0000${site}`;
}

function formatDuration(ms: number): string {
  if (ms % HOUR === 0) return `${ms / HOUR}h`;
  if (ms % MINUTE === 0) return `${ms / MINUTE}min`;
  return `${Math.round(ms / 1000)}s`;
}
