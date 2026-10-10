import { ApprovalStore } from "./approval-store.js";
import { AuditLogger, safeAuditDetail } from "./audit.js";
import {
  BrowserManager,
  normalizeProfile,
  type LiveAudioChunk,
  type LiveFrameMediaMeta,
  type LiveMediaEvent,
} from "./browser-manager.js";
import type { BrowserConfig } from "./config.js";
import { AudioVisionAnalyzer } from "./audio-vision.js";
import {
  assertSafeModelActivation,
  assertSafeTypingTarget,
  classifyClickRisk,
} from "./policy.js";
import { ProfileQueue } from "./profile-queue.js";
import { parseBrowserWaitMs } from "./action-limits.js";
import { assertModelNavigationUrl, assertModelReadablePageUrl } from "./navigation-policy.js";
import {
  SITE_RISK_ACTIVATION_ACTIONS,
  SITE_RISK_OBSERVED_ACTIONS,
  SiteRiskPolicy,
  classifyMutation,
  collectPageObservationInPage,
  loadSiteBudgetOverrides,
  type PageObservation,
  type SiteDefinition,
  type SiteFreeze,
} from "./site-risk-policy.js";

export type BrowserAction =
  | "browser_profiles"
  | "browser_open"
  | "browser_back"
  | "browser_forward"
  | "browser_reload"
  | "browser_audio_vision"
  | "browser_media_context"
  | "browser_media_seek"
  | "browser_read"
  | "browser_snapshot"
  | "browser_hover"
  | "browser_click"
  | "browser_double_click"
  | "browser_request_click_approval"
  | "browser_approval_status"
  | "browser_type"
  | "browser_press"
  | "browser_select"
  | "browser_set_files"
  | "browser_scroll"
  | "browser_wait"
  | "browser_screenshot"
  | "browser_close_profile";

export interface BrowserCall {
  action: BrowserAction;
  args: Record<string, unknown>;
  client?: string;
}

export interface BrowserReply {
  ok: boolean;
  result?: unknown;
  error?: string;
  /** Trusted Worker relay terminal state; legacy replies omit this. */
  code?: "cancelled" | "timeout" | "outcome_unknown";
}

interface Takeover {
  owner: string;
  since: string;
}

const TAKEOVER_SAFE_MODEL_ACTIONS = new Set<BrowserAction>([
  "browser_profiles",
  "browser_read",
  "browser_snapshot",
  "browser_screenshot",
  "browser_audio_vision",
  "browser_media_context",
  "browser_approval_status",
]);

export class BrowserService {
  private readonly browsers: BrowserManager;
  private readonly queue = new ProfileQueue();
  private readonly audit: AuditLogger;
  private readonly takeovers = new Map<string, Takeover>();
  private readonly approvals = new ApprovalStore();
  private readonly siteRisk: SiteRiskPolicy;
  private readonly audioPlaybackListeners = new Map<
    string,
    (chunk: LiveAudioChunk) => void | Promise<void>
  >();
  private readonly audioVisionAnalyzers = new Map<string, AudioVisionAnalyzer>();
  private readonly audioVisionIdleTimers = new Map<string, NodeJS.Timeout>();
  private readonly audioCaptureInfo = new Map<string, {
    profile: string;
    supported: boolean;
    videoCount: number;
    audioTracks: number;
    sampleRate: number;
    state: string;
  }>();

  constructor(
    private readonly config: BrowserConfig,
    options: { siteRisk?: SiteRiskPolicy } = {},
  ) {
    this.siteRisk = options.siteRisk ?? new SiteRiskPolicy({
      sites: loadSiteBudgetOverrides(process.env.TONGPING_SITE_RISK_BUDGETS),
    });
    this.browsers = new BrowserManager(config);
    this.audit = new AuditLogger(config.homeDir);
  }

  async call(call: BrowserCall): Promise<BrowserReply> {
    const client = cleanClient(call.client);
    const profile =
      call.action === "browser_profiles"
        ? undefined
        : stringArg(call.args, "profile", "default");

    const execute = async (): Promise<BrowserReply> => {
      try {
        if (
          profile &&
          this.takeovers.has(normalizeProfile(profile)) &&
          !TAKEOVER_SAFE_MODEL_ACTIONS.has(call.action)
        ) {
          const takeover = this.takeovers.get(normalizeProfile(profile));
          throw new Error(
            `Profile ${profile} is under human takeover by ${takeover?.owner ?? "human"} since ${takeover?.since ?? "unknown"}. Release takeover before model control resumes.`,
          );
        }

        if (profile && call.action !== "browser_open" && call.action !== "browser_close_profile") {
          const page = await this.browsers.page(profile);
          assertModelReadablePageUrl(page.url());
        }

        if (profile) {
          await this.siteRiskBefore(profile, call.action, call.args, client);
        }

        let result: unknown;
        try {
          result = await this.execute(
            call.action,
            call.args,
            client,
          );
        } catch (error) {
          if (profile) await this.siteRiskAfter(profile, call.action, client);
          throw error;
        }
        const freeze = profile
          ? await this.siteRiskAfter(profile, call.action, client)
          : undefined;
        if (freeze && result && typeof result === "object" && !Array.isArray(result)) {
          result = {
            ...result,
            siteRisk: {
              ...freeze,
              frozen: true,
              humanRequired: true,
              message: `${freeze.site} showed ${freeze.state}. Further model write actions on ${freeze.site} are stopped for this profile. Tell the user and ask them to take over. Do not retry.`,
            },
          };
        }
        await this.audit.write({
          at: new Date().toISOString(),
          client,
          action: call.action,
          profile,
          ok: true,
          url: extractUrl(result),
          detail: safeAuditDetail(call.action, call.args),
        });
        return { ok: true, result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        await this.audit.write({
          at: new Date().toISOString(),
          client,
          action: call.action,
          profile,
          ok: false,
          detail: safeAuditDetail(call.action, call.args),
          error: message.slice(0, 500),
        });
        return { ok: false, error: message };
      }
    };

    return profile
      ? this.queue.run(normalizeProfile(profile), execute)
      : execute();
  }

  async humanTakeoverStart(
    profile: string,
    owner = "human-mobile",
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      const takeover = {
        owner: cleanClient(owner),
        since: new Date().toISOString(),
      };
      this.takeovers.set(normalized, takeover);
      await this.audit.write({
        at: takeover.since,
        client: takeover.owner,
        action: "human_takeover_start",
        profile: normalized,
        ok: true,
      });
      return this.humanStatus(normalized);
    });
  }

  async humanTakeoverEnd(
    profile: string,
    owner = "human-mobile",
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      this.takeovers.delete(normalized);
      await this.audit.write({
        at: new Date().toISOString(),
        client: cleanClient(owner),
        action: "human_takeover_end",
        profile: normalized,
        ok: true,
      });
      await this.siteRiskClearAfterTakeover(normalized, cleanClient(owner));
      return this.humanStatus(normalized);
    });
  }

  /** A slider / login wall the automated browser cannot pass, if showing. */
  restoreWindowIfMinimized(profile: string): Promise<boolean> {
    return this.browsers.restoreWindowIfMinimized(profile);
  }

  onShownTabChange(listener: (profile: string) => void): void {
    this.browsers.onShownTabChange(listener);
  }

  async verificationChallenge(profile: string): Promise<{ reason: string; url: string } | null> {
    return this.browsers.verificationChallenge(profile);
  }

  async humanStatus(profile: string): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    const profiles = await this.browsers.listProfiles();
    const browser = profiles.find(
      (item) => item.profile === normalized,
    );
    const takeover = this.takeovers.get(normalized);
    return {
      profile: normalized,
      browser: browser ?? {
        profile: normalized,
        active: false,
        pages: 0,
      },
      takeover: takeover
        ? {
            active: true,
            ...takeover,
          }
        : {
            active: false,
          },
      approvals: this.approvals.pending(normalized),
      siteRisk: this.siteRisk.status(normalized),
    };
  }

  private async siteRiskBefore(
    profile: string,
    action: BrowserAction,
    args: Record<string, unknown>,
    client: string,
  ): Promise<void> {
    if (!SITE_RISK_ACTIVATION_ACTIONS.has(action)) return;
    const normalized = normalizeProfile(profile);
    const current = await this.observeSite(normalized);
    if (!current) return;
    const { site, observation } = current;
    const { state, frozeNow } = this.siteRisk.observe(normalized, site, observation, { action, client });
    if (frozeNow) await this.auditSiteFreeze(normalized, client, frozeNow);
    this.siteRisk.assertMutationAllowed(normalized, site, state);

    let target;
    if (action === "browser_click" || action === "browser_double_click" || action === "browser_press") {
      const ref = optionalString(args, "ref");
      if (ref) {
        target = await this.browsers.targetInfo(normalized, ref);
      } else if (action === "browser_click") {
        const x = optionalNumberArg(args, "x");
        const y = optionalNumberArg(args, "y");
        if (x !== undefined && y !== undefined) {
          target = await this.browsers.targetInfoAtPoint(normalized, x, y);
        }
      }
    }
    const mutation = classifyMutation(action, target, { key: optionalString(args, "key") });
    if (mutation) this.siteRisk.consume(normalized, site, mutation);
  }

  private async siteRiskAfter(
    profile: string,
    action: BrowserAction,
    client: string,
  ): Promise<SiteFreeze | undefined> {
    if (!SITE_RISK_OBSERVED_ACTIONS.has(action)) return undefined;
    try {
      const normalized = normalizeProfile(profile);
      const current = await this.observeSite(normalized);
      if (!current) return undefined;
      const { frozeNow } = this.siteRisk.observe(normalized, current.site, current.observation, { action, client });
      if (frozeNow) await this.auditSiteFreeze(normalized, client, frozeNow);
      return frozeNow;
    } catch {
      return undefined;
    }
  }

  private async siteRiskClearAfterTakeover(profile: string, client: string): Promise<void> {
    try {
      const current = await this.observeSite(profile);
      if (!current) return;
      const cleared = this.siteRisk.clearIfResolved(profile, current.site, current.observation);
      if (!cleared) return;
      await this.audit.write({
        at: new Date().toISOString(),
        client,
        action: "site_risk_cleared",
        profile,
        ok: true,
        detail: { site: cleared.site, previousState: cleared.state },
      });
    } catch {
      // A failed observation leaves the freeze in place.
    }
  }

  private async observeSite(
    profile: string,
  ): Promise<{ site: SiteDefinition; observation: PageObservation } | undefined> {
    const page = await this.browsers.page(profile);
    const url = page.url();
    const site = this.siteRisk.siteForUrl(url);
    if (!site) return undefined;
    const partial = await page.evaluate(collectPageObservationInPage);
    return {
      site,
      observation: { url, title: await page.title(), ...partial },
    };
  }

  private async auditSiteFreeze(profile: string, client: string, freeze: SiteFreeze): Promise<void> {
    await this.audit.write({
      at: freeze.since,
      client,
      action: "site_risk_freeze",
      profile,
      ok: true,
      detail: { site: freeze.site, riskState: freeze.state, trigger: freeze.action },
    });
  }

  async humanApprovalDecision(
    approvalId: string,
    approved: boolean,
    owner = "human-mobile",
  ): Promise<unknown> {
    const actor = cleanClient(owner);
    const approval = this.approvals.decide(
      approvalId,
      approved,
      actor,
    );
    await this.audit.write({
      at: new Date().toISOString(),
      client: actor,
      action: approved
        ? "human_approval_approve"
        : "human_approval_deny",
      profile: approval.profile,
      ok: true,
      detail: {
        approvalId: approval.id,
        ref: approval.ref,
      },
    });
    return approval;
  }

  async humanPreview(profile: string): Promise<{
    title: string;
    url: string;
    buffer: Buffer;
    viewport: { width: number; height: number } | null;
  }> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, () =>
      this.browsers.screenshot(normalized, false),
    );
  }

  async humanClick(
    profile: string,
    x: number,
    y: number,
    owner = "human-mobile",
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      this.requireTakeover(normalized);
      await this.browsers.clickAt(normalized, x, y);
      await this.audit.write({
        at: new Date().toISOString(),
        client: cleanClient(owner),
        action: "human_click",
        profile: normalized,
        ok: true,
        detail: {
          x: Math.round(x),
          y: Math.round(y),
        },
      });
      return {
        profile: normalized,
        clicked: { x, y },
      };
    });
  }

  async humanPointer(
    profile: string,
    phase: "down" | "move" | "up",
    x: number,
    y: number,
    owner = "human-mobile",
    button: "left" | "right" = "left",
    clickCount = 1,
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      this.requireTakeover(normalized);
      await this.browsers.pointerAt(
        normalized, phase, x, y, button, clickCount,
      );
      if (phase !== "move") {
        await this.audit.write({
          at: new Date().toISOString(),
          client: cleanClient(owner),
          action: "human_pointer_" + phase,
          profile: normalized,
          ok: true,
          detail: {
            x: Math.round(x),
            y: Math.round(y),
            button,
            clickCount,
          },
        });
      }
      return { profile: normalized, phase, x, y, button, clickCount };
    });
  }

  async humanPointerRealtime(
    profile: string,
    phase: "down" | "move" | "up",
    x: number,
    y: number,
    owner = "app-ws",
    button: "left" | "right" = "left",
    clickCount = 1,
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    this.requireTakeover(normalized);
    await this.browsers.pointerAt(
      normalized, phase, x, y, button, clickCount,
    );
    if (phase !== "move") {
      await this.audit.write({
        at: new Date().toISOString(),
        client: cleanClient(owner),
        action: "human_pointer_" + phase,
        profile: normalized,
        ok: true,
        detail: {
          x: Math.round(x),
          y: Math.round(y),
          button,
          clickCount,
        },
      });
    }
    return { profile: normalized, phase, x, y, button, clickCount };
  }

  async humanContextInfo(
    profile: string,
    x: number,
    y: number,
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    this.requireTakeover(normalized);
    const target = await this.browsers.targetInfoAtPoint(normalized, x, y);
    const page = await this.browsers.page(normalized);
    return {
      profile: normalized,
      x,
      y,
      url: page.url(),
      target,
    };
  }

  async startLiveScreencast(
    profile: string,
    onFrame: (frame: {
      buffer: Buffer;
      width: number;
      height: number;
      sequence: number;
      capturedAt: number;
      media: LiveFrameMediaMeta | null;
    }) => void | Promise<void>,
  ): Promise<void> {
    const normalized = normalizeProfile(profile);
    await this.browsers.startLiveScreencast(normalized, onFrame);
  }

  async stopLiveScreencast(profile: string): Promise<void> {
    const normalized = normalizeProfile(profile);
    await this.browsers.stopLiveScreencast(normalized);
  }

  async startLiveAudio(
    profile: string,
    onChunk: (chunk: LiveAudioChunk) => void | Promise<void>,
  ): Promise<{
    profile: string;
    supported: boolean;
    videoCount: number;
    audioTracks: number;
    sampleRate: number;
    state: string;
  }> {
    const normalized = normalizeProfile(profile);
    this.audioPlaybackListeners.set(normalized, onChunk);
    return this.ensureSharedAudioCapture(normalized);
  }

  async stopLiveAudio(profile: string): Promise<void> {
    const normalized = normalizeProfile(profile);
    this.audioPlaybackListeners.delete(normalized);
    await this.maybeStopSharedAudioCapture(normalized);
  }

  async startLiveMedia(
    profile: string,
    onEvent: (event: LiveMediaEvent) => void | Promise<void>,
    options: {
      includeAudio?: boolean;
      chunkMs?: number;
      videoBitsPerSecond?: number;
      audioBitsPerSecond?: number;
      keepSourcePlaying?: boolean;
      preferH264?: boolean;
    } = {},
  ): Promise<unknown> {
    return this.browsers.startLiveMedia(profile, onEvent, options);
  }

  async stopLiveMedia(profile: string): Promise<void> {
    await this.browsers.stopLiveMedia(profile);
  }

  async readMediaClock(profile: string): Promise<unknown> {
    return this.browsers.readMediaClock(profile);
  }

  async pauseLiveMedia(
    profile: string,
    paused: boolean,
  ): Promise<unknown> {
    return this.browsers.pauseLiveMedia(profile, paused);
  }

  async readAudioVision(
    profile: string,
    seconds = 5,
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    let analyzer = this.audioVisionAnalyzers.get(normalized);
    if (!analyzer) {
      analyzer = new AudioVisionAnalyzer(normalized);
      this.audioVisionAnalyzers.set(normalized, analyzer);
    }

    const oldTimer = this.audioVisionIdleTimers.get(normalized);
    if (oldTimer) clearTimeout(oldTimer);

    const timer = setTimeout(() => {
      this.audioVisionIdleTimers.delete(normalized);
      this.audioVisionAnalyzers.delete(normalized);
      void this.maybeStopSharedAudioCapture(normalized);
    }, 60_000);
    timer.unref?.();
    this.audioVisionIdleTimers.set(normalized, timer);

    const capture = await this.ensureSharedAudioCapture(normalized);
    if (!analyzer.hasData()) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    return {
      ...analyzer.read(seconds),
      capture,
      source: "local-dsp",
      rawAudioTransferredToModel: false,
    };
  }

  private async ensureSharedAudioCapture(
    profile: string,
  ): Promise<{
    profile: string;
    supported: boolean;
    videoCount: number;
    audioTracks: number;
    sampleRate: number;
    state: string;
  }> {
    const existing = this.audioCaptureInfo.get(profile);
    if (
      existing &&
      await this.browsers.liveAudioControllerActive(profile)
    ) {
      return existing;
    }
    if (existing) {
      await this.browsers.stopLiveAudio(profile).catch(() => {});
    }
    this.audioCaptureInfo.delete(profile);

    const result = await this.browsers.startLiveAudio(
      profile,
      async (chunk) => {
        const listener = this.audioPlaybackListeners.get(profile);
        if (listener) {
          await Promise.resolve(listener(chunk)).catch(() => {});
        }
        const analyzer = this.audioVisionAnalyzers.get(profile);
        if (analyzer) analyzer.ingest(chunk);
      },
    );
    this.audioCaptureInfo.set(profile, result);
    return result;
  }

  private async maybeStopSharedAudioCapture(profile: string): Promise<void> {
    if (
      this.audioPlaybackListeners.has(profile) ||
      this.audioVisionAnalyzers.has(profile)
    ) {
      return;
    }
    this.audioCaptureInfo.delete(profile);
    await this.browsers.stopLiveAudio(profile);
  }

  async humanDrag(
    profile: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps = 18,
    owner = "human-mobile",
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      this.requireTakeover(normalized);
      await this.browsers.dragAt(
        normalized,
        startX,
        startY,
        endX,
        endY,
        steps,
      );
      const safeSteps = Math.max(2, Math.min(60, Math.round(steps)));
      await this.audit.write({
        at: new Date().toISOString(),
        client: cleanClient(owner),
        action: "human_drag",
        profile: normalized,
        ok: true,
        detail: {
          startX: Math.round(startX),
          startY: Math.round(startY),
          endX: Math.round(endX),
          endY: Math.round(endY),
          steps: safeSteps,
        },
      });
      return {
        profile: normalized,
        dragged: { startX, startY, endX, endY },
      };
    });
  }

  async humanType(
    profile: string,
    text: string,
    owner = "human-mobile",
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      this.requireTakeover(normalized);
      await this.browsers.insertText(normalized, text);
      await this.audit.write({
        at: new Date().toISOString(),
        client: cleanClient(owner),
        action: "human_type",
        profile: normalized,
        ok: true,
        detail: { chars: text.length },
      });
      return {
        profile: normalized,
        chars: text.length,
      };
    });
  }

  async humanKey(
    profile: string,
    key: string,
    owner = "human-mobile",
  ): Promise<unknown> {
    const normalized = normalizeProfile(profile);
    return this.queue.run(normalized, async () => {
      this.requireTakeover(normalized);
      await this.browsers.pressKey(normalized, key);
      await this.audit.write({
        at: new Date().toISOString(),
        client: cleanClient(owner),
        action: "human_key",
        profile: normalized,
        ok: true,
        detail: { key },
      });
      return { profile: normalized, key };
    });
  }

  async close(): Promise<void> {
    for (const timer of this.audioVisionIdleTimers.values()) {
      clearTimeout(timer);
    }
    this.audioVisionIdleTimers.clear();
    this.audioVisionAnalyzers.clear();
    this.audioPlaybackListeners.clear();
    this.audioCaptureInfo.clear();
    await this.browsers.closeAll();
  }

  private requireTakeover(profile: string): Takeover {
    const takeover = this.takeovers.get(profile);
    if (!takeover) {
      throw new Error(
        `Profile ${profile} is not under human takeover. Start takeover before sending human input.`,
      );
    }
    return takeover;
  }

  private async execute(
    action: BrowserAction,
    args: Record<string, unknown>,
    client: string,
  ): Promise<unknown> {
    switch (action) {
      case "browser_profiles": {
        const profiles = await this.browsers.listProfiles();
        return profiles.map((profile) => {
          const takeover = this.takeovers.get(profile.profile);
          return {
            ...profile,
            url: profile.url && isModelReadablePageUrl(profile.url) ? profile.url : undefined,
            modelReadable: !profile.url || isModelReadablePageUrl(profile.url),
            takeover: takeover
              ? {
                  active: true,
                  ...takeover,
                }
              : {
                  active: false,
                },
            approvals: this.approvals.pending(profile.profile),
          };
        });
      }

      case "browser_open": {
        const profile = stringArg(args, "profile", "default");
        const url = optionalString(args, "url");
        if (Object.hasOwn(args, "url") && url === undefined) {
          throw new Error("Model navigation requires an absolute HTTP or HTTPS URL.");
        }
        if (url !== undefined) assertModelNavigationUrl(url);
        const page = await this.browsers.open(profile, url);
        // Sites like Douyin redirect (or bounce to a login page) right after
        // load; read the page once that navigation has settled.
        return await retryAfterNavigationRace(page, async () => {
          assertModelReadablePageUrl(page.url());
          const viewport = await page.evaluate(() => ({
            width: Math.max(
              1,
              Math.round(
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1,
              ),
            ),
            height: Math.max(
              1,
              Math.round(
                window.innerHeight ||
                document.documentElement.clientHeight ||
                1,
              ),
            ),
          }));
          return {
            profile,
            title: await page.title(),
            url: page.url(),
            viewport,
          };
        });
      }

      case "browser_back": {
        const profile = stringArg(args, "profile", "default");
        const page = await this.browsers.page(profile);
        const before = page.url();
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 })
          .catch(() => null);
        assertModelReadablePageUrl(page.url());
        return {
          profile,
          direction: "back",
          changed: page.url() !== before,
          title: await page.title(),
          url: page.url(),
        };
      }

      case "browser_forward": {
        const profile = stringArg(args, "profile", "default");
        const page = await this.browsers.page(profile);
        const before = page.url();
        await page.goForward({ waitUntil: "domcontentloaded", timeout: 10_000 })
          .catch(() => null);
        assertModelReadablePageUrl(page.url());
        return {
          profile,
          direction: "forward",
          changed: page.url() !== before,
          title: await page.title(),
          url: page.url(),
        };
      }

      case "browser_reload": {
        const profile = stringArg(args, "profile", "default");
        const page = await this.browsers.page(profile);
        await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 })
          .catch(() => null);
        assertModelReadablePageUrl(page.url());
        return {
          profile,
          reloaded: true,
          title: await page.title(),
          url: page.url(),
        };
      }

      case "browser_audio_vision": {
        const profile = stringArg(args, "profile", "default");
        const seconds = numberArg(args, "seconds", 5);
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) {
          throw new Error("browser_audio_vision seconds must be between 1 and 30.");
        }
        return this.readAudioVision(profile, seconds);
      }

      case "browser_media_context": {
        const profile = stringArg(args, "profile", "default");
        const lookbackSeconds = numberArg(args, "lookbackSeconds", 120);
        const maxCues = numberArg(args, "maxCues", 120);
        if (
          !Number.isFinite(lookbackSeconds) ||
          lookbackSeconds < 0 ||
          lookbackSeconds > 3600
        ) {
          throw new Error(
            "browser_media_context lookbackSeconds must be between 0 and 3600.",
          );
        }
        if (!Number.isFinite(maxCues) || maxCues < 1 || maxCues > 500) {
          throw new Error(
            "browser_media_context maxCues must be between 1 and 500.",
          );
        }
        return this.browsers.readMediaContext(
          profile,
          lookbackSeconds,
          maxCues,
        );
      }

      case "browser_media_seek": {
        const profile = stringArg(args, "profile", "default");
        const targetSeconds = numberArg(args, "targetSeconds", 0);
        if (
          !Number.isFinite(targetSeconds) ||
          targetSeconds < 0 ||
          targetSeconds > 86_400
        ) {
          throw new Error(
            "browser_media_seek targetSeconds must be between 0 and 86400.",
          );
        }
        return this.browsers.seekMedia(profile, targetSeconds);
      }

      case "browser_read": {
        const profile = stringArg(args, "profile", "default");
        const format = stringArg(args, "format", "text");
        if (format !== "text" && format !== "html") {
          throw new Error("browser_read format must be text or html.");
        }
        return this.browsers.read(
          profile,
          stringArg(args, "selector", "body"),
          numberArg(args, "maxChars", 30_000),
          format,
        );
      }

      case "browser_snapshot": {
        const profile = stringArg(args, "profile", "default");
        return this.browsers.snapshot(
          profile,
          numberArg(args, "maxElements", 120),
          stringArg(args, "selector", "body"),
          numberArg(args, "offset", 0),
          booleanArg(args, "includeImages", false),
        );
      }

      case "browser_hover": {
        const profile = normalizeProfile(
          stringArg(args, "profile", "default"),
        );
        const ref = optionalString(args, "ref");
        if (ref) {
          const target = await this.browsers.hoverRef(profile, ref);
          return {
            hovered: ref,
            target,
            url: (await this.browsers.page(profile)).url(),
          };
        }

        const x = optionalNumberArg(args, "x");
        const y = optionalNumberArg(args, "y");
        if (x === undefined || y === undefined) {
          throw new Error("browser_hover requires either ref or both x and y.");
        }
        const target = await this.browsers.hoverAt(profile, x, y);
        return {
          hovered: { x, y },
          target,
          url: (await this.browsers.page(profile)).url(),
        };
      }

      case "browser_request_click_approval": {
        const profile = normalizeProfile(
          stringArg(args, "profile", "default"),
        );
        const ref = stringArg(args, "ref");
        const reason = optionalString(args, "reason");
        const target = await this.browsers.targetInfo(
          profile,
          ref,
        );
        const risk = classifyClickRisk(target);

        if (!risk.highRisk) {
          return {
            required: false,
            risk,
            message:
              "This target is not classified as high-risk; browser_click can proceed without approval.",
          };
        }

        const approval = this.approvals.request({
          profile,
          ref,
          target,
          requestedBy: client,
          reason,
        });

        return {
          required: true,
          risk,
          approval,
          message:
            "Approval requested. Wait for the user to approve it, then call browser_click with this approvalId before it expires.",
        };
      }

      case "browser_approval_status": {
        const profile = normalizeProfile(
          stringArg(args, "profile", "default"),
        );
        const approvalId = stringArg(args, "approvalId");
        const approval = this.approvals.status(approvalId);
        if (approval.profile !== profile) {
          throw new Error(
            "Approval does not belong to this profile.",
          );
        }
        return approval;
      }

      case "browser_click": {
        const profile = normalizeProfile(
          stringArg(args, "profile", "default"),
        );
        const ref = optionalString(args, "ref");
        const approvalId = optionalString(args, "approvalId");

        if (!ref) {
          const x = optionalNumberArg(args, "x");
          const y = optionalNumberArg(args, "y");
          if (x === undefined || y === undefined) {
            throw new Error("browser_click requires either ref or both x and y.");
          }

          const info = await this.browsers.targetInfoAtPoint(profile, x, y);
          const risk = classifyClickRisk(info);
          if (risk.highRisk) {
            throw new Error(
              `High-risk coordinate click blocked (${risk.matched ?? "sensitive-action"}): ${JSON.stringify(risk.summary)}. Take a browser_snapshot and use the exact ref approval flow instead.`,
            );
          }

          await this.browsers.clickAt(profile, x, y);
          const page = await this.browsers.page(profile);
          await page
            .waitForLoadState("domcontentloaded", { timeout: 3000 })
            .catch(() => undefined);

          return {
            clicked: { x, y },
            target: info,
            risk,
            url: page.url(),
            title: await page.title(),
          };
        }

        const info = await this.browsers.targetInfo(profile, ref);
        const risk = classifyClickRisk(info);

        let approval:
          | ReturnType<ApprovalStore["consume"]>
          | undefined;

        if (risk.highRisk) {
          if (!approvalId) {
            throw new Error(
              `High-risk click blocked (${risk.matched ?? "sensitive-action"}): ${JSON.stringify(risk.summary)}. Call browser_request_click_approval first.`,
            );
          }

          approval = this.approvals.consume({
            id: approvalId,
            profile,
            ref,
            target: info,
          });
        }

        const locator = await this.browsers.locator(profile, ref);
        await locator.click();
        const page = await this.browsers.page(profile);
        await page
          .waitForLoadState("domcontentloaded", {
            timeout: 3000,
          })
          .catch(() => undefined);

        return {
          clicked: ref,
          target: info,
          risk,
          approvalId: approval?.id,
          url: page.url(),
          title: await page.title(),
        };
      }

      case "browser_double_click": {
        const profile = normalizeProfile(
          stringArg(args, "profile", "default"),
        );
        const ref = stringArg(args, "ref");
        const info = await this.browsers.targetInfo(profile, ref);
        assertSafeModelActivation(info, "double click");
        const locator = await this.browsers.locator(profile, ref);
        await locator.dblclick({ timeout: 3_000, delay: 90 });
        return {
          doubleClicked: ref,
          target: info,
          url: (await this.browsers.page(profile)).url(),
        };
      }

      case "browser_type": {
        const profile = stringArg(args, "profile", "default");
        const ref = stringArg(args, "ref");
        const text = stringArg(args, "text");
        const append = booleanArg(args, "append", false);
        const info = await this.browsers.targetInfo(profile, ref);
        assertSafeTypingTarget({
          type: info.type,
          autocomplete: info.autocomplete,
        });
        assertSafeModelActivation(info, "type");

        const locator = await this.browsers.locator(profile, ref);
        if (!(await locator.isEditable())) {
          throw new Error("browser_type requires an editable field.");
        }
        if (append) {
          await locator.focus({ timeout: 3_000 });
          await locator.pressSequentially(text, { delay: 18 });
        } else {
          try {
            await locator.fill(text, { timeout: 3_000 });
          } catch {
            await locator.focus({ timeout: 3_000 });
            await locator.press("Control+A");
            await locator.press("Backspace");
            await locator.pressSequentially(text, { delay: 18 });
          }
        }
        return {
          typed: ref,
          chars: text.length,
          append,
        };
      }

      case "browser_press": {
        const profile = stringArg(args, "profile", "default");
        const ref = stringArg(args, "ref");
        const key = stringArg(args, "key");
        const allowed = new Set([
          "Enter", "Escape", "Tab", "Space",
          "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
          "Home", "End", "PageUp", "PageDown",
        ]);
        if (!allowed.has(key)) {
          throw new Error("Unsupported browser key: " + key);
        }
        const info = await this.browsers.targetInfo(profile, ref);
        assertSafeTypingTarget({
          type: info.type,
          autocomplete: info.autocomplete,
        });
        assertSafeModelActivation(info, "press");
        if (key === "Enter") {
          const submit = await this.browsers.associatedSubmitTarget(profile, ref);
          if (submit) assertSafeModelActivation(submit, "press");
        }
        const locator = await this.browsers.locator(profile, ref);
        await locator.focus({ timeout: 3_000 });
        await locator.press(key);
        return { pressed: ref, key };
      }

      case "browser_select": {
        const profile = stringArg(args, "profile", "default");
        const ref = stringArg(args, "ref");
        const value = stringArg(args, "value");
        assertSafeModelActivation(await this.browsers.targetInfo(profile, ref), "select");
        const locator = await this.browsers.locator(profile, ref);
        const selected = await locator.selectOption(value);
        return { ref, selected };
      }

      case "browser_set_files": {
        const profile = stringArg(args, "profile", "default");
        const ref = stringArg(args, "ref");
        const rawFiles = args.files;
        if (!Array.isArray(rawFiles) || rawFiles.length < 1 || rawFiles.length > 8) {
          throw new Error("files must contain 1-8 small file payloads.");
        }
        let totalBytes = 0;
        const files = rawFiles.map((raw, index) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error(`files[${index}] must be an object.`);
          }
          const record = raw as Record<string, unknown>;
          const name = typeof record.name === "string" ? record.name.trim() : "";
          const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim() : "";
          const base64 = typeof record.base64 === "string" ? record.base64 : "";
          if (!/^[a-zA-Z0-9._ -]{1,120}$/.test(name)) {
            throw new Error(`files[${index}].name is invalid.`);
          }
          if (!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(mimeType)) {
            throw new Error(`files[${index}].mimeType is invalid.`);
          }
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
            throw new Error(`files[${index}].base64 is invalid.`);
          }
          const buffer = Buffer.from(base64, "base64");
          if (buffer.length < 1 || buffer.length > 4_000_000) {
            throw new Error(`files[${index}] must be between 1 byte and 4 MB.`);
          }
          totalBytes += buffer.length;
          if (totalBytes > 8_000_000) {
            throw new Error("Total small-file upload payload must not exceed 8 MB.");
          }
          return { name, mimeType, buffer };
        });
        const result = await this.browsers.setInputFiles(profile, ref, files);
        return { ref, ...result, totalBytes };
      }

      case "browser_scroll": {
        const profile = stringArg(args, "profile", "default");
        const deltaY = numberArg(args, "deltaY", 800);
        const page = await this.browsers.page(profile);
        const scroll = await this.browsers.scroll(profile, deltaY);
        await page.waitForTimeout(180);
        return {
          url: page.url(),
          ...scroll,
        };
      }

      case "browser_wait": {
        const profile = stringArg(args, "profile", "default");
        const ms = parseBrowserWaitMs(args.ms);
        const page = await this.browsers.page(profile);
        await page.waitForTimeout(ms);
        return {
          waitedMs: ms,
          url: page.url(),
        };
      }

      case "browser_screenshot": {
        const profile = stringArg(args, "profile", "default");
        const fullPage = booleanArg(args, "fullPage", false);
        const smallJpeg = args.format === "small-jpeg" && !fullPage;
        const shot = await this.browsers.screenshot(
          profile,
          fullPage,
          smallJpeg ? "small-jpeg" : "png",
        );
        assertModelReadablePageUrl(shot.url);
        return {
          title: shot.title,
          url: shot.url,
          fullPage,
          viewport: shot.viewport,
          mimeType: shot.buffer[0] === 0xff && shot.buffer[1] === 0xd8 ? "image/jpeg" : "image/png",
          base64: shot.buffer.toString("base64"),
        };
      }

      case "browser_close_profile": {
        const profile = stringArg(args, "profile", "default");
        await this.browsers.close(profile);
        return { closed: profile };
      }

      default:
        return assertNever(action);
    }
  }
}

function stringArg(
  args: Record<string, unknown>,
  key: string,
  fallback?: string,
): string {
  const value = args[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing string argument: ${key}`);
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

function optionalNumberArg(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function numberArg(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = args[key];
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function booleanArg(
  args: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = args[key];
  return typeof value === "boolean"
    ? value
    : fallback;
}

function cleanClient(
  client: string | undefined,
): string {
  const value = client?.trim().slice(0, 80);
  return value || "unknown";
}

function extractUrl(
  result: unknown,
): string | undefined {
  if (
    result &&
    typeof result === "object" &&
    "url" in result &&
    typeof (result as { url?: unknown }).url === "string"
  ) {
    return (result as { url: string }).url;
  }
  return undefined;
}

function isModelReadablePageUrl(url: string): boolean {
  try {
    assertModelReadablePageUrl(url);
    return true;
  } catch {
    return false;
  }
}

function assertNever(value: never): never {
  throw new Error(
    `Unknown browser action: ${String(value)}`,
  );
}

function isNavigationRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed|Cannot find context with specified id/i.test(message);
}

export async function retryAfterNavigationRace<T>(
  page: { waitForLoadState(state: "domcontentloaded", options?: { timeout?: number }): Promise<void> },
  read: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= 2 || !isNavigationRace(error)) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    }
  }
}
