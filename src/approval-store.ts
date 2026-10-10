import crypto from "node:crypto";
import type { ClickTarget } from "./policy.js";
import { clickTargetSummary } from "./policy.js";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "consumed"
  | "expired";

export interface ClickApproval {
  id: string;
  profile: string;
  ref: string;
  targetFingerprint: string;
  targetSummary: string;
  reason?: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  decidedAt?: string;
  decidedBy?: string;
}

export class ApprovalStore {
  private readonly approvals = new Map<string, ClickApproval>();

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
  ) {}

  request(input: {
    profile: string;
    ref: string;
    target: ClickTarget;
    requestedBy: string;
    reason?: string;
  }): ClickApproval {
    this.expireOld();

    const now = Date.now();
    const approval: ClickApproval = {
      id: `apr_${crypto.randomBytes(12).toString("base64url")}`,
      profile: input.profile,
      ref: input.ref,
      targetFingerprint: fingerprintClickTarget(input.target),
      targetSummary: clickTargetSummary(input.target).slice(0, 240),
      reason: input.reason?.trim().slice(0, 300) || undefined,
      requestedBy: input.requestedBy,
      requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      status: "pending",
    };

    this.approvals.set(approval.id, approval);
    return { ...approval };
  }

  decide(
    id: string,
    approved: boolean,
    decidedBy: string,
  ): ClickApproval {
    this.expireOld();

    const approval = this.mustGet(id);
    if (approval.status !== "pending") {
      throw new Error(
        `Approval ${id} is already ${approval.status}.`,
      );
    }

    approval.status = approved ? "approved" : "denied";
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = decidedBy;
    return { ...approval };
  }

  status(id: string): ClickApproval {
    this.expireOld();
    return { ...this.mustGet(id) };
  }

  pending(profile?: string): ClickApproval[] {
    this.expireOld();
    return [...this.approvals.values()]
      .filter(
        (approval) =>
          approval.status === "pending" &&
          (!profile || approval.profile === profile),
      )
      .map((approval) => ({ ...approval }));
  }

  consume(input: {
    id: string;
    profile: string;
    ref: string;
    target: ClickTarget;
  }): ClickApproval {
    this.expireOld();

    const approval = this.mustGet(input.id);
    if (approval.status !== "approved") {
      throw new Error(
        `Approval ${input.id} is ${approval.status}; an approved one-shot token is required.`,
      );
    }

    if (
      approval.profile !== input.profile ||
      approval.ref !== input.ref
    ) {
      throw new Error(
        "Approval does not match the requested profile/ref.",
      );
    }

    const fingerprint = fingerprintClickTarget(input.target);
    if (approval.targetFingerprint !== fingerprint) {
      throw new Error(
        "Approval target no longer matches the current element. Request a fresh approval.",
      );
    }

    approval.status = "consumed";
    return { ...approval };
  }

  private mustGet(id: string): ClickApproval {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Unknown approval: ${id}`);
    }
    return approval;
  }

  private expireOld() {
    const now = Date.now();
    for (const approval of this.approvals.values()) {
      if (
        (approval.status === "pending" ||
          approval.status === "approved") &&
        Date.parse(approval.expiresAt) <= now
      ) {
        approval.status = "expired";
      }
    }
  }
}

export function fingerprintClickTarget(
  target: ClickTarget,
): string {
  const canonical = JSON.stringify({
    text: target.text ?? "",
    ariaLabel: target.ariaLabel ?? "",
    href: target.href ?? "",
    role: target.role ?? "",
    tag: target.tag ?? "",
  });

  return crypto
    .createHash("sha256")
    .update(canonical)
    .digest("hex");
}
