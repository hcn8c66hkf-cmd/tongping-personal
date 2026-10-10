import assert from "node:assert/strict";
import test from "node:test";
import { safeAuditDetail } from "../src/audit.js";

test("browser_type audit never stores typed text", () => {
  const secret = "this text must not enter the audit log";
  const detail = safeAuditDetail("browser_type", {
    profile: "goofish",
    ref: "mb-12",
    text: secret,
    append: false,
  });

  assert.deepEqual(detail, {
    ref: "mb-12",
    append: false,
    chars: secret.length,
  });
  assert.equal(JSON.stringify(detail).includes(secret), false);
});

test("approval request audit stores reason length, not reason text", () => {
  const reason = "buy this exact item only if price is unchanged";
  const detail = safeAuditDetail(
    "browser_request_click_approval",
    {
      profile: "goofish",
      ref: "mb-9",
      reason,
    },
  );

  assert.deepEqual(detail, {
    ref: "mb-9",
    reasonChars: reason.length,
  });
  assert.equal(JSON.stringify(detail).includes(reason), false);
});
