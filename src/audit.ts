import fs from "node:fs/promises";
import path from "node:path";

export interface AuditEntry {
  at: string;
  client: string;
  action: string;
  profile?: string;
  ok: boolean;
  url?: string;
  detail?: Record<string, unknown>;
  error?: string;
}

export class AuditLogger {
  private readonly filePath: string;

  constructor(homeDir: string) {
    this.filePath = path.join(homeDir, "audit", "actions.jsonl");
  }

  async write(entry: AuditEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(this.filePath, line, { encoding: "utf8", mode: 0o600 });
  }
}

export function safeAuditDetail(
  action: string,
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (action) {
    case "browser_open":
      return typeof args.url === "string" ? { url: args.url } : undefined;
    case "browser_read":
      return {
        selector: args.selector,
        maxChars: args.maxChars,
      };
    case "browser_snapshot":
      return { maxElements: args.maxElements };
    case "browser_click":
      return { ref: args.ref, approvalId: args.approvalId };
    case "browser_request_click_approval":
      return {
        ref: args.ref,
        reasonChars: typeof args.reason === "string" ? args.reason.length : 0,
      };
    case "browser_approval_status":
      return { approvalId: args.approvalId };
    case "browser_type":
      return {
        ref: args.ref,
        append: args.append,
        chars: typeof args.text === "string" ? args.text.length : 0,
      };
    case "browser_select":
      return { ref: args.ref };
    case "browser_scroll":
      return { deltaY: args.deltaY };
    case "browser_wait":
      return { ms: args.ms };
    case "browser_screenshot":
      return { fullPage: args.fullPage };
    case "browser_close_profile":
      return undefined;
    default:
      return undefined;
  }
}
