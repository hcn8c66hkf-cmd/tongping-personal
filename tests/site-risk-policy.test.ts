import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BUDGETS,
  SiteRiskBlockedError,
  SiteRiskPolicy,
  classifyMutation,
  detectDouyinRisk,
  detectXiaohongshuRisk,
  loadSiteBudgetOverrides,
  type PageObservation,
  type SiteDefinition,
} from "../src/site-risk-policy.js";

const xhs = (overrides: Partial<PageObservation> = {}): PageObservation => ({
  url: "https://www.xiaohongshu.com/explore/abc123",
  title: "小红书 - 你的生活指南",
  overlayText: "",
  bodyText: "笔记正文 ".repeat(300),
  bodyLength: 1500,
  ...overrides,
});

function clockPolicy(start = Date.UTC(2026, 8, 28, 12)) {
  let now = start;
  const policy = new SiteRiskPolicy({ now: () => now });
  const site = policy.siteForUrl("https://www.xiaohongshu.com/explore")!;
  return {
    policy,
    site,
    advance(ms: number) {
      now += ms;
    },
  };
}

function cooldown(fn: () => void): SiteRiskBlockedError {
  try {
    fn();
  } catch (error) {
    assert(error instanceof SiteRiskBlockedError);
    assert.equal(error.code, "site_risk_cooldown");
    return error;
  }
  assert.fail("expected a cooldown");
}

test("site matching covers xiaohongshu hosts only", () => {
  const policy = new SiteRiskPolicy();
  assert.equal(policy.siteForUrl("https://www.xiaohongshu.com/explore")?.id, "xiaohongshu");
  assert.equal(policy.siteForUrl("https://creator.xiaohongshu.com/publish")?.id, "xiaohongshu");
  assert.equal(policy.siteForUrl("http://xhslink.com/a/b")?.id, "xiaohongshu");
  assert.equal(policy.siteForUrl("https://notxiaohongshu.com/"), undefined);
  assert.equal(policy.siteForUrl("https://www.douyin.com/video/1")?.id, "douyin");
  assert.equal(policy.siteForUrl("https://www.iesdouyin.com/share/video/1")?.id, "douyin");
  assert.equal(policy.siteForUrl("https://www.bilibili.com/"), undefined);
  assert.equal(policy.siteForUrl("about:blank"), undefined);
});

test("xiaohongshu detector: normal content page is clear", () => {
  assert.equal(detectXiaohongshuRisk(xhs()), "clear");
  // Risk words inside long note content do not trigger on their own.
  assert.equal(
    detectXiaohongshuRisk(xhs({ bodyText: "今天聊聊账号异常和操作频繁怎么办 ".repeat(80), bodyLength: 2400 })),
    "clear",
  );
});

test("xiaohongshu detector: known risk pages and overlays", () => {
  assert.equal(
    detectXiaohongshuRisk(xhs({ url: "https://www.xiaohongshu.com/website-login/captcha?redirectPath=x&verifyUuid=1" })),
    "verification_required",
  );
  assert.equal(
    detectXiaohongshuRisk(xhs({ url: "https://www.xiaohongshu.com/website-login/error?error_code=300013" })),
    "unknown_block",
  );
  assert.equal(
    detectXiaohongshuRisk(xhs({ bodyText: "Sorry, This Page Isn't Available Right Now.", bodyLength: 44 })),
    "unknown_block",
  );
  assert.equal(detectXiaohongshuRisk(xhs({ overlayText: "请完成安全验证 拖动滑块" })), "verification_required");
  assert.equal(detectXiaohongshuRisk(xhs({ overlayText: "操作太频繁，请稍后再试" })), "temporary_restriction");
  assert.equal(detectXiaohongshuRisk(xhs({ overlayText: "当前账号存在异常" })), "temporary_restriction");
  assert.equal(detectXiaohongshuRisk(xhs({ overlayText: "评论失败" })), "write_rejected");
});

test("xiaohongshu detector: SMS login dialog is login_required, not verification", () => {
  assert.equal(
    detectXiaohongshuRisk(xhs({ overlayText: "手机号登录 获取验证码 扫码登录" })),
    "login_required",
  );
});

test("mutation classification", () => {
  assert.equal(classifyMutation("browser_click", { text: "12", visibleText: "12", hint: "like-wrapper like-active #like" }), "light");
  assert.equal(classifyMutation("browser_click", { text: "收藏", visibleText: "收藏" }), "light");
  assert.equal(classifyMutation("browser_click", { text: "关注", visibleText: "关注" }), "light");
  assert.equal(classifyMutation("browser_click", { text: "发送", visibleText: "发送", tag: "button" }), "content");
  assert.equal(classifyMutation("browser_click", { text: "发布", visibleText: "发布", hint: "publishBtn" }), "heavy");
  assert.equal(classifyMutation("browser_set_files", undefined), "heavy");
  // Navigation links and long cards are not writes.
  assert.equal(classifyMutation("browser_click", { text: "发布笔记", visibleText: "发布笔记", href: "https://creator.xiaohongshu.com/publish" }), undefined);
  assert.equal(
    classifyMutation("browser_click", { text: "一篇很长的笔记标题 作者 1234 赞", visibleText: "一篇很长的笔记标题，关于周末去哪里玩 作者名 1234" }),
    undefined,
  );
  assert.equal(classifyMutation("browser_click", { text: "展开", visibleText: "展开" }), undefined);
  // Enter in the comment box is a content write; Enter in search is not.
  assert.equal(classifyMutation("browser_press", { tag: "p", hint: "content-input" }, { key: "Enter" }), "content");
  assert.equal(classifyMutation("browser_press", { tag: "input", hint: "search-input" }, { key: "Enter" }), undefined);
  assert.equal(classifyMutation("browser_press", { tag: "textarea" }, { key: "Escape" }), undefined);
  assert.equal(classifyMutation("browser_type", { tag: "textarea" }), undefined);
});

test("budget: minimum interval then window cap, shared across clients", () => {
  const { policy, site, advance } = clockPolicy();
  policy.consume("default", site, "content");
  const tooSoon = cooldown(() => policy.consume("default", site, "content"));
  assert.match(tooSoon.message, /Retry after 30s/);
  assert.equal(tooSoon.retryAfterMs, 30_000);

  for (let i = 1; i < 5; i += 1) {
    advance(30_000);
    policy.consume("default", site, "content");
  }
  advance(30_000);
  const capped = cooldown(() => policy.consume("default", site, "content"));
  assert.match(capped.message, /5 content writes per 10min/);
  // Oldest of the five was 150s ago; it leaves the 10-minute window in 450s.
  assert.equal(capped.retryAfterMs, 450_000);
});

test("budget: refused attempts do not consume budget; classes and profiles are separate", () => {
  const { policy, site, advance } = clockPolicy();
  policy.consume("default", site, "content");
  cooldown(() => policy.consume("default", site, "content"));
  cooldown(() => policy.consume("default", site, "content"));
  advance(30_000);
  policy.consume("default", site, "content");

  policy.consume("default", site, "light");
  policy.consume("other", site, "content");
  const status = policy.status("default")[0]!;
  assert.deepEqual(status.used, { light: 1, content: 2, heavy: 0 });
});

test("freeze: risk state blocks writes until a human-cleared page reads clear", () => {
  const { policy, site } = clockPolicy();
  const first = policy.observe("default", site, xhs({ overlayText: "操作太频繁" }), { action: "browser_click", client: "claude" });
  assert.equal(first.state, "temporary_restriction");
  assert.equal(first.frozeNow?.state, "temporary_restriction");
  // Repeated observation does not re-freeze or change the record.
  assert.equal(
    policy.observe("default", site, xhs({ overlayText: "操作太频繁" }), { action: "browser_click", client: "gpt" }).frozeNow,
    undefined,
  );

  assert.throws(
    () => policy.assertMutationAllowed("default", site, "clear"),
    (error: unknown) => error instanceof SiteRiskBlockedError && error.code === "site_risk_human_required",
  );
  // Another profile is unaffected.
  assert.doesNotThrow(() => policy.assertMutationAllowed("other", site, "clear"));

  assert.equal(policy.clearIfResolved("default", site, xhs({ overlayText: "操作太频繁" })), undefined);
  assert.equal(policy.status("default")[0]!.frozen, true);
  assert.equal(policy.clearIfResolved("default", site, xhs())?.state, "temporary_restriction");
  assert.doesNotThrow(() => policy.assertMutationAllowed("default", site, "clear"));
});

test("login_required refuses writes without freezing", () => {
  const { policy, site } = clockPolicy();
  const observed = policy.observe("default", site, xhs({ overlayText: "获取验证码" }), { action: "browser_click", client: "claude" });
  assert.equal(observed.state, "login_required");
  assert.equal(observed.frozeNow, undefined);
  assert.throws(() => policy.assertMutationAllowed("default", site, observed.state), /requires login/);
  assert.doesNotThrow(() => policy.assertMutationAllowed("default", site, "clear"));
});

test("budget overrides accept valid values and ignore invalid ones", () => {
  const sites = loadSiteBudgetOverrides(
    JSON.stringify({
      xiaohongshu: {
        content: { minIntervalMs: 60_000, windows: [{ windowMs: 3_600_000, max: 3 }] },
        light: { minIntervalMs: -1, windows: [] },
      },
    }),
  );
  const site = sites.find((item: SiteDefinition) => item.id === "xiaohongshu")!;
  assert.deepEqual(site.budgets.content, { minIntervalMs: 60_000, windows: [{ windowMs: 3_600_000, max: 3 }] });
  assert.deepEqual(site.budgets.light, DEFAULT_BUDGETS.light);
  assert.equal(loadSiteBudgetOverrides("not json")[0]!.budgets, DEFAULT_BUDGETS);
});

const douyin = (overrides: Partial<PageObservation> = {}): PageObservation => ({
  url: "https://www.douyin.com/video/7400000000000000000",
  title: "抖音",
  overlayText: "",
  bodyText: "视频描述 评论区 ".repeat(200),
  bodyLength: 1600,
  ...overrides,
});

test("douyin detector", () => {
  assert.equal(detectDouyinRisk(douyin()), "clear");
  assert.equal(detectDouyinRisk(douyin({ captchaElement: true })), "verification_required");
  assert.equal(
    detectDouyinRisk(douyin({ url: "https://verify.snssdk.com/verifycenter/captcha/v2?aid=6383" })),
    "verification_required",
  );
  assert.equal(detectDouyinRisk(douyin({ title: "验证码中间页", bodyText: "", bodyLength: 0 })), "verification_required");
  assert.equal(detectDouyinRisk(douyin({ overlayText: "请完成下列验证后继续" })), "verification_required");
  assert.equal(detectDouyinRisk(douyin({ overlayText: "操作过于频繁，请稍后再试" })), "temporary_restriction");
  assert.equal(detectDouyinRisk(douyin({ overlayText: "评论失败" })), "write_rejected");
  assert.equal(detectDouyinRisk(douyin({ overlayText: "扫码登录 验证码登录 密码登录" })), "login_required");
  // A verified-account badge or long comments do not trigger.
  assert.equal(detectDouyinRisk(douyin({ bodyText: "账号异常怎么办 操作太频繁 ".repeat(100), bodyLength: 2400 })), "clear");
});

test("douyin mutation classification", () => {
  assert.equal(classifyMutation("browser_click", { text: "1.2万", visibleText: "1.2万", dataE2E: "video-player-digg" }), "light");
  assert.equal(classifyMutation("browser_click", { text: "", visibleText: "", dataE2E: "video-player-collect" }), "light");
  assert.equal(
    classifyMutation("browser_press", { tag: "div", role: "textbox", hint: "public-DraftEditor-content" }, { key: "Enter" }),
    "content",
  );
  assert.equal(
    classifyMutation("browser_press", { tag: "input", type: "text", dataE2E: "searchbar-input" }, { key: "Enter" }),
    undefined,
  );
  assert.equal(classifyMutation("browser_press", { tag: "div", hint: "xgplayer" }, { key: "ArrowDown" }), undefined);
});
