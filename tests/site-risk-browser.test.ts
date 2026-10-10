import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BrowserService, type BrowserAction } from "../src/browser-service.js";
import {
  DEFAULT_BUDGETS,
  SiteRiskPolicy,
  detectXiaohongshuRisk,
} from "../src/site-risk-policy.js";

const notePage = `<!doctype html><title>note fixture</title>
<div class="note">${"正文内容 ".repeat(300)}</div>
<span class="like-wrapper" role="button" onclick="document.querySelector('#likes').textContent=String(Number(document.querySelector('#likes').textContent)+1)"><svg><use href="#like"></use></svg><span>3</span></span>
<button id="expand">展开</button>
<button id="block" onclick="const d=document.createElement('div');d.setAttribute('role','dialog');d.textContent='操作太频繁，请稍后再试';document.body.append(d)">展开更多</button>
<p id="likes">0</p>`;

test("site risk gate on a real Chromium profile", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-site-risk-"));
  const server = createServer((_req, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(notePage);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/explore/fixture`;

  let now = Date.UTC(2026, 8, 28, 12);
  const siteRisk = new SiteRiskPolicy({
    now: () => now,
    sites: [{ id: "xiaohongshu", hosts: ["127.0.0.1"], budgets: DEFAULT_BUDGETS, detect: detectXiaohongshuRisk }],
  });
  const service = new BrowserService(
    { homeDir: root, profilesDir: path.join(root, "profiles"), headless: true },
    { siteRisk },
  );
  const call = (action: BrowserAction, args: Record<string, unknown> = {}, client = "claude") =>
    service.call({ action, args: { profile: "test", ...args }, client });
  const read = async (selector: string) => {
    const reply = await call("browser_read", { selector });
    assert.equal(reply.ok, true, reply.error);
    return (reply.result as { text: string }).text;
  };

  try {
    assert.equal((await call("browser_open", { url })).ok, true);
    const snap = await call("browser_snapshot");
    assert.equal(snap.ok, true, snap.error);
    const elements = (snap.result as { elements: Array<{ ref: string; text: string; tag: string }> }).elements;
    const like = elements.find((item) => item.tag === "span" || /^3$/.test(item.text.trim()))?.ref;
    const expand = elements.find((item) => item.text.trim() === "展开")?.ref;
    const block = elements.find((item) => item.text.trim() === "展开更多")?.ref;
    assert(like && expand && block, JSON.stringify(elements));

    // Light write goes through, a second one inside 3s is refused across clients.
    const first = await call("browser_click", { ref: like }, "claude");
    assert.equal(first.ok, true, first.error);
    const second = await call("browser_click", { ref: like }, "gpt");
    assert.equal(second.ok, false);
    assert.match(second.error ?? "", /^site_risk_cooldown: xiaohongshu light/);
    assert.equal(await read("#likes"), "1");
    now += 3_000;
    assert.equal((await call("browser_click", { ref: like }, "gpt")).ok, true);
    assert.equal(await read("#likes"), "2");

    // Ordinary UI clicks do not consume budget.
    assert.equal((await call("browser_click", { ref: expand })).ok, true);
    assert.equal((await call("browser_click", { ref: expand })).ok, true);

    // A risk overlay appearing after a click freezes further writes.
    const blocked = await call("browser_click", { ref: block });
    assert.equal(blocked.ok, true, blocked.error);
    const siteRiskResult = (blocked.result as { siteRisk?: { state: string; frozen: boolean } }).siteRisk;
    assert.equal(siteRiskResult?.state, "temporary_restriction");
    assert.equal(siteRiskResult?.frozen, true);

    now += 60_000;
    const frozen = await call("browser_click", { ref: like }, "codex");
    assert.equal(frozen.ok, false);
    assert.match(frozen.error ?? "", /^site_risk_human_required/);
    assert.equal((await call("browser_click", { ref: expand })).ok, false);
    assert.equal(await read("#likes"), "2");

    // Reads stay available.
    assert.equal((await call("browser_snapshot")).ok, true);
    assert.equal((await call("browser_screenshot")).ok, true);

    // Ending takeover while the overlay is still there keeps the freeze.
    await service.humanTakeoverStart("test", "human-test");
    await service.humanTakeoverEnd("test", "human-test");
    assert.equal((await call("browser_click", { ref: expand })).ok, false);

    // After the page is clear again, ending takeover lifts it.
    assert.equal((await call("browser_reload")).ok, true);
    await service.humanTakeoverStart("test", "human-test");
    const status = await service.humanTakeoverEnd("test", "human-test") as {
      siteRisk: Array<{ site: string; frozen: boolean }>;
    };
    assert.equal(status.siteRisk[0]?.frozen, false);
    const after = await call("browser_snapshot");
    const likeAfter = (after.result as { elements: Array<{ ref: string; text: string; tag: string }> }).elements
      .find((item) => item.tag === "span" || /^3$/.test(item.text.trim()))?.ref;
    assert.equal((await call("browser_click", { ref: likeAfter })).ok, true);

    const audit = await readFile(path.join(root, "audit", "actions.jsonl"), "utf8");
    assert.match(audit, /"action":"site_risk_freeze"[^\n]*"riskState":"temporary_restriction"/);
    assert.match(audit, /"action":"site_risk_cleared"/);
    assert.doesNotMatch(audit, /操作太频繁/);
  } finally {
    await service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
