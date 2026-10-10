export interface ClickTarget {
  text?: string;
  visibleText?: string;
  ariaLabel?: string;
  title?: string;
  dataE2E?: string;
  href?: string;
  role?: string;
  tag?: string;
}

export interface ClickRisk {
  highRisk: boolean;
  summary: string;
  matched?: string;
}

const HIGH_RISK_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "buy-now", pattern: /立即购买/i },
  { label: "confirm-purchase", pattern: /确认购买/i },
  { label: "place-order", pattern: /下单/i },
  { label: "submit-order", pattern: /提交订单/i },
  { label: "confirm-order", pattern: /确认订单/i },
  { label: "checkout", pattern: /去结算/i },
  { label: "checkout", pattern: /结算/i },
  { label: "payment", pattern: /付款/i },
  { label: "payment", pattern: /支付/i },
  { label: "confirm-payment", pattern: /确认支付/i },
  { label: "transfer", pattern: /转账/i },
  { label: "transfer", pattern: /汇款/i },
  { label: "recharge", pattern: /充值/i },
  { label: "delete-account", pattern: /删除账号/i },
  { label: "delete-account", pattern: /注销账号/i },
  { label: "permanent-delete", pattern: /永久删除/i },
  {
    label: "confirm-sensitive-action",
    pattern: /confirm\s+(?:purchase|payment|order|transfer|delete)/i,
  },
  { label: "buy-now", pattern: /buy\s+now/i },
  { label: "checkout", pattern: /checkout/i },
  { label: "place-order", pattern: /place\s+order/i },
  { label: "pay-now", pattern: /pay\s+now/i },
  { label: "delete-account", pattern: /delete\s+account/i },
];

export function classifyClickRisk(target: ClickTarget): ClickRisk {
  const summary = clickTargetSummary(target);
  const match = HIGH_RISK_PATTERNS.find(({ pattern }) =>
    pattern.test(summary),
  );

  return {
    highRisk: Boolean(match),
    summary: summary.slice(0, 240),
    matched: match?.label,
  };
}

export function clickTargetSummary(target: ClickTarget): string {
  return [
    target.text,
    target.visibleText,
    target.ariaLabel,
    target.title,
    target.dataE2E,
    target.href,
    target.role,
    target.tag,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertSafeClick(target: ClickTarget): void {
  const risk = classifyClickRisk(target);
  if (risk.highRisk) {
    throw new Error(
      `Blocked high-risk click target: ${JSON.stringify(risk.summary)}. Request explicit approval before retrying this action.`,
    );
  }
}

export function assertSafeModelActivation(target: ClickTarget, action: string): void {
  const risk = classifyClickRisk(target);
  if (risk.highRisk) {
    throw new Error(
      `High-risk ${action} blocked (${risk.matched ?? "sensitive-action"}): ${JSON.stringify(risk.summary)}. Use browser_request_click_approval, then browser_click for a single approved click.`,
    );
  }
}

export function assertSafeTypingTarget(input: {
  type?: string;
  autocomplete?: string;
}): void {
  const type = input.type?.toLowerCase();
  const autocomplete = (input.autocomplete?.toLowerCase() ?? "").split(/\s+/);

  if (
    type === "password" ||
    autocomplete.some((token) =>
      token === "current-password" ||
      token === "new-password" ||
      token === "one-time-code" ||
      token.startsWith("cc-"),
    )
  ) {
    throw new Error(
      "Typing into password fields is blocked. One-time code and card fields are also blocked. Complete credential entry manually in the visible browser.",
    );
  }
}
