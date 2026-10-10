import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalStore } from "../src/approval-store.js";

const target = {
  text: "立即购买",
  ariaLabel: "",
  href: "https://shop.example/item/1",
  role: "button",
  tag: "button",
};

test("approved click token is one-shot and target-bound", () => {
  const store = new ApprovalStore(60_000);
  const requested = store.request({
    profile: "goofish",
    ref: "mb-9",
    target,
    requestedBy: "gpt",
    reason: "The user asked me to buy this exact item",
  });

  assert.equal(requested.status, "pending");

  const approved = store.decide(
    requested.id,
    true,
    "human-mobile",
  );
  assert.equal(approved.status, "approved");

  const consumed = store.consume({
    id: requested.id,
    profile: "goofish",
    ref: "mb-9",
    target,
  });
  assert.equal(consumed.status, "consumed");

  assert.throws(
    () =>
      store.consume({
        id: requested.id,
        profile: "goofish",
        ref: "mb-9",
        target,
      }),
    /consumed/,
  );
});

test("approval cannot be reused for a changed target", () => {
  const store = new ApprovalStore(60_000);
  const requested = store.request({
    profile: "goofish",
    ref: "mb-9",
    target,
    requestedBy: "gpt",
  });

  store.decide(requested.id, true, "human-mobile");

  assert.throws(
    () =>
      store.consume({
        id: requested.id,
        profile: "goofish",
        ref: "mb-9",
        target: {
          ...target,
          href: "https://shop.example/item/2",
        },
      }),
    /no longer matches/,
  );
});

test("denied approval cannot execute", () => {
  const store = new ApprovalStore(60_000);
  const requested = store.request({
    profile: "goofish",
    ref: "mb-9",
    target,
    requestedBy: "gpt",
  });

  store.decide(requested.id, false, "human-mobile");

  assert.throws(
    () =>
      store.consume({
        id: requested.id,
        profile: "goofish",
        ref: "mb-9",
        target,
      }),
    /denied/,
  );
});

test("expired approval cannot execute", async () => {
  const store = new ApprovalStore(50);
  const requested = store.request({
    profile: "goofish",
    ref: "mb-9",
    target,
    requestedBy: "gpt",
  });

  store.decide(requested.id, true, "human-mobile");
  await new Promise((resolve) => setTimeout(resolve, 75));

  assert.throws(
    () =>
      store.consume({
        id: requested.id,
        profile: "goofish",
        ref: "mb-9",
        target,
      }),
    /expired/,
  );
});
