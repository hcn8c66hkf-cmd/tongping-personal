import fs from "node:fs/promises";
import path from "node:path";
import type {
  BrowserAction,
  BrowserCall,
  BrowserReply,
  BrowserService,
} from "./browser-service.js";

export type HumanBrowserAction =
  | "human_status"
  | "human_preview"
  | "human_live_start"
  | "human_live_stop"
  | "human_audio_start"
  | "human_audio_stop"
  | "human_media_start"
  | "human_media_stop"
  | "human_media_restart"
  | "human_media_pause"
  | "human_media_clock"
  | "human_external_login_start"
  | "human_external_login_finish"
  | "human_takeover_start"
  | "human_takeover_end"
  | "human_click"
  | "human_context_info"
  | "human_pointer"
  | "human_drag"
  | "human_type"
  | "human_key";

export interface BrowserGateway {
  call(
    action: BrowserAction,
    args: Record<string, unknown>,
    clientOverride?: string,
  ): Promise<BrowserReply>;

  human(
    action: HumanBrowserAction,
    args: Record<string, unknown>,
    clientOverride?: string,
  ): Promise<BrowserReply>;
}

export class LocalGateway implements BrowserGateway {
  constructor(
    private readonly service: BrowserService,
    private readonly clientName: string,
  ) {}

  call(
    action: BrowserAction,
    args: Record<string, unknown>,
    clientOverride?: string,
  ): Promise<BrowserReply> {
    return this.service.call({
      action,
      args,
      client: clientOverride?.trim() || this.clientName,
    });
  }

  async human(
    action: HumanBrowserAction,
    args: Record<string, unknown>,
    clientOverride?: string,
  ): Promise<BrowserReply> {
    const client = clientOverride?.trim() || this.clientName;
    try {
      switch (action) {
        case "human_status":
          return {
            ok: true,
            result: await this.service.humanStatus(stringArg(args, "profile")),
          };
        case "human_preview": {
          const preview = await this.service.humanPreview(
            stringArg(args, "profile"),
          );
          return {
            ok: true,
            result: {
              title: preview.title,
              url: preview.url,
              viewport: preview.viewport,
              mimeType: "image/png",
              base64: preview.buffer.toString("base64"),
            },
          };
        }
        case "human_live_start":
          return {
            ok: true,
            result: {
              profile: stringArg(args, "profile"),
              live: false,
              transport: "remote-worker-only",
            },
          };
        case "human_live_stop":
          return {
            ok: true,
            result: {
              profile: stringArg(args, "profile"),
              live: false,
              transport: "remote-worker-only",
            },
          };
        case "human_audio_start":
          return {
            ok: true,
            result: {
              profile: stringArg(args, "profile"),
              audio: false,
              transport: "remote-worker-only",
            },
          };
        case "human_audio_stop":
          return {
            ok: true,
            result: {
              profile: stringArg(args, "profile"),
              audio: false,
              transport: "remote-worker-only",
            },
          };
        case "human_media_start":
        case "human_media_restart":
          return {
            ok: true,
            result: {
              profile: stringArg(args, "profile"),
              media: false,
              transport: "remote-worker-only",
            },
          };
        case "human_media_pause":
        case "human_media_clock":
        case "human_media_stop":
          return {
            ok: true,
            result: {
              profile: stringArg(args, "profile"),
              media: false,
              transport: "remote-worker-only",
            },
          };
        case "human_external_login_start":
        case "human_external_login_finish":
          return {
            ok: false,
            error:
              "Local manual login requires the paired desktop worker v28+.",
          };
        case "human_takeover_start":
          return {
            ok: true,
            result: await this.service.humanTakeoverStart(
              stringArg(args, "profile"),
              client,
            ),
          };
        case "human_takeover_end":
          return {
            ok: true,
            result: await this.service.humanTakeoverEnd(
              stringArg(args, "profile"),
              client,
            ),
          };
        case "human_click":
          return {
            ok: true,
            result: await this.service.humanClick(
              stringArg(args, "profile"),
              numberArg(args, "x"),
              numberArg(args, "y"),
              client,
            ),
          };
        case "human_context_info":
          return {
            ok: true,
            result: await this.service.humanContextInfo(
              stringArg(args, "profile"),
              numberArg(args, "x"),
              numberArg(args, "y"),
            ),
          };
        case "human_pointer":
          return {
            ok: true,
            result: await this.service.humanPointer(
              stringArg(args, "profile"),
              stringArg(args, "phase") as "down" | "move" | "up",
              numberArg(args, "x"),
              numberArg(args, "y"),
              client,
            ),
          };
        case "human_drag":
          return {
            ok: true,
            result: await this.service.humanDrag(
              stringArg(args, "profile"),
              numberArg(args, "startX"),
              numberArg(args, "startY"),
              numberArg(args, "endX"),
              numberArg(args, "endY"),
              typeof args.steps === "number" ? args.steps : 18,
              client,
            ),
          };
        case "human_type":
          return {
            ok: true,
            result: await this.service.humanType(
              stringArg(args, "profile"),
              stringArg(args, "text"),
              client,
            ),
          };
        case "human_key":
          return {
            ok: true,
            result: await this.service.humanKey(
              stringArg(args, "profile"),
              stringArg(args, "key"),
              client,
            ),
          };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class DaemonGateway implements BrowserGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly clientName: string,
  ) {}

  async call(
    action: BrowserAction,
    args: Record<string, unknown>,
    clientOverride?: string,
  ): Promise<BrowserReply> {
    const response = await fetch(new URL("/v1/action", this.baseUrl), {
      method: "POST",
      headers: this.headers(clientOverride, true),
      body: JSON.stringify({ action, args }),
    });

    const data = (await response.json().catch(() => ({}))) as BrowserReply;
    if (!response.ok) {
      return {
        ok: false,
        error:
          data.error ??
          `tongping daemon returned HTTP ${response.status}`,
      };
    }
    return data;
  }

  async human(
    action: HumanBrowserAction,
    args: Record<string, unknown>,
    clientOverride?: string,
  ): Promise<BrowserReply> {
    const profile = stringArg(args, "profile");
    try {
      if (action === "human_status") {
        const url = new URL("/v1/human/status", this.baseUrl);
        url.searchParams.set("profile", profile);
        const response = await fetch(url, {
          headers: this.headers(clientOverride, false),
        });
        return jsonReply(response);
      }

      if (action === "human_preview") {
        const url = new URL("/v1/human/screenshot", this.baseUrl);
        url.searchParams.set("profile", profile);
        const response = await fetch(url, {
          headers: this.headers(clientOverride, false),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return {
            ok: false,
            error: text || `tongping daemon returned HTTP ${response.status}`,
          };
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          ok: true,
          result: {
            viewport: {
              width: Number(
                response.headers.get("x-tongping-viewport-width") || "0",
              ),
              height: Number(
                response.headers.get("x-tongping-viewport-height") || "0",
              ),
            },
            mimeType: response.headers.get("content-type") || "image/png",
            base64: bytes.toString("base64"),
          },
        };
      }

      if (
        action === "human_external_login_start" ||
        action === "human_external_login_finish"
      ) {
        return {
          ok: false,
          error:
            "Local manual login is handled by the paired desktop worker, not the daemon HTTP bridge.",
        };
      }

      const endpoint =
        action === "human_takeover_start"
          ? "/v1/human/takeover/start"
          : action === "human_takeover_end"
            ? "/v1/human/takeover/end"
            : action === "human_click"
              ? "/v1/human/click"
              : action === "human_pointer"
                ? "/v1/human/pointer"
                : action === "human_drag"
                  ? "/v1/human/drag"
                  : action === "human_type"
                  ? "/v1/human/type"
                  : "/v1/human/key";

      const body: Record<string, unknown> = { profile };
      if (action === "human_click" || action === "human_context_info") {
        body.x = numberArg(args, "x");
        body.y = numberArg(args, "y");
      } else if (action === "human_pointer") {
        body.phase = stringArg(args, "phase");
        body.x = numberArg(args, "x");
        body.y = numberArg(args, "y");
      } else if (action === "human_drag") {
        body.startX = numberArg(args, "startX");
        body.startY = numberArg(args, "startY");
        body.endX = numberArg(args, "endX");
        body.endY = numberArg(args, "endY");
        body.steps =
          typeof args.steps === "number" ? args.steps : 18;
      } else if (action === "human_type") {
        body.text = stringArg(args, "text");
      } else if (action === "human_key") {
        body.key = stringArg(args, "key");
      }

      const response = await fetch(new URL(endpoint, this.baseUrl), {
        method: "POST",
        headers: this.headers(clientOverride, true),
        body: JSON.stringify(body),
      });
      return jsonReply(response);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private headers(
    clientOverride: string | undefined,
    json: boolean,
  ): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      ...(json ? { "content-type": "application/json" } : {}),
      "x-tongping-client":
        clientOverride?.trim() || this.clientName,
    };
  }
}

export async function readLocalDaemonToken(homeDir: string): Promise<string> {
  const envToken = process.env.TONGPING_TOKEN?.trim();
  if (envToken) return envToken;
  return (
    await fs.readFile(path.join(homeDir, "daemon-token"), "utf8")
  ).trim();
}

export function isBrowserCall(value: unknown): value is BrowserCall {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.action === "string" &&
    Boolean(record.args) &&
    typeof record.args === "object" &&
    !Array.isArray(record.args)
  );
}

async function jsonReply(response: Response): Promise<BrowserReply> {
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof data.error === "string"
          ? data.error
          : `tongping daemon returned HTTP ${response.status}`,
    };
  }
  return { ok: true, result: data };
}

function stringArg(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing string argument: ${key}`);
  }
  return value.trim();
}

function numberArg(
  args: Record<string, unknown>,
  key: string,
): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing numeric argument: ${key}`);
  }
  return value;
}
