import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeClick,
  assertSafeTypingTarget,
  classifyClickRisk,
} from "../src/policy.js";

test("ordinary browse and messaging actions are allowed", () => {
  assert.doesNotThrow(() =>
    assertSafeClick({ text: "收藏", role: "button" }),
  );
  assert.doesNotThrow(() =>
    assertSafeClick({ text: "聊一聊", role: "button" }),
  );
  assert.doesNotThrow(() =>
    assertSafeClick({ text: "发送", role: "button" }),
  );
  assert.equal(
    classifyClickRisk({ text: "收藏", role: "button" }).highRisk,
    false,
  );
});

test("purchase and payment targets are classified and blocked", () => {
  const risk = classifyClickRisk({
    text: "立即购买",
    role: "button",
  });
  assert.equal(risk.highRisk, true);
  assert.equal(risk.matched, "buy-now");

  assert.throws(
    () => assertSafeClick({ text: "立即购买" }),
    /Blocked high-risk/,
  );
  assert.throws(
    () => assertSafeClick({ text: "去结算" }),
    /Blocked high-risk/,
  );
  assert.throws(
    () => assertSafeClick({ text: "确认支付" }),
    /Blocked high-risk/,
  );
  assert.throws(
    () => assertSafeClick({ text: "Buy now" }),
    /Blocked high-risk/,
  );
  assert.throws(
    () =>
      assertSafeClick({
        href: "https://shop.example/checkout",
      }),
    /Blocked high-risk/,
  );
});

test("password fields are blocked", () => {
  assert.throws(
    () => assertSafeTypingTarget({ type: "password" }),
    /password fields is blocked/i,
  );
  assert.throws(
    () =>
      assertSafeTypingTarget({
        autocomplete: "current-password",
      }),
    /password fields is blocked/i,
  );
  assert.doesNotThrow(() =>
    assertSafeTypingTarget({
      type: "text",
      autocomplete: "username",
    }),
  );
});

test("visible payment text cannot be hidden by an innocuous aria label", () => {
  const risk = classifyClickRisk({ text: "继续", visibleText: "确认支付", ariaLabel: "继续" });
  assert.equal(risk.highRisk, true);
});

test("standard one-time code and card autocomplete fields are blocked", () => {
  for (const autocomplete of ["one-time-code", "section-checkout ONE-TIME-CODE", "cc-number", "section-pay cc-csc"]) {
    assert.throws(() => assertSafeTypingTarget({ type: "text", autocomplete }), /blocked/i);
  }
  assert.doesNotThrow(() => assertSafeTypingTarget({ type: "text", autocomplete: "off" }));
});
