import test from "node:test";
import assert from "node:assert/strict";
import { createTongpingMcpServer } from "../src/mcp-server.js";
import type { BrowserGateway } from "../src/gateway.js";

type ScreenshotResult = { content?: Array<{ type: string; text?: string }> };

async function invokeScreenshot(profileReplies: Array<{ ok: boolean; result?: unknown; error?: string }>) {
  const calls: string[] = [];
  let profilesRead = 0;
  const gateway: BrowserGateway = {
    async call(action) {
      calls.push(action);
      if (action === "browser_profiles") return profileReplies[Math.min(profilesRead++, profileReplies.length - 1)]!;
      if (action === "browser_screenshot") return { ok: false, error: "page became privileged" };
      throw new Error(`Unexpected action: ${action}`);
    },
    async human() { throw new Error("Unexpected human action"); },
  } as BrowserGateway;
  const server = createTongpingMcpServer(gateway, "test", {
    appSigningKey: Buffer.alloc(32, 1),
    liveEnabled: true,
  });
  const handler = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<ScreenshotResult> }> })
    ._registeredTools.browser_screenshot!.handler;
  const originalFetch = globalThis.fetch;
  let cacheFetches = 0;
  globalThis.fetch = async () => {
    cacheFetches++;
    return new Response(Buffer.from("cached private frame"), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  };
  try {
    const result = await handler({ profile: "default", fullPage: false });
    return { calls, cacheFetches, result };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("screenshot does not read a cached frame when profile status is unavailable", async () => {
  const { calls, cacheFetches, result } = await invokeScreenshot([{ ok: false, error: "worker unavailable" }]);
  assert.equal(cacheFetches, 0);
  assert.ok(calls.includes("browser_screenshot"));
  assert.equal(result.content?.some((item) => item.type === "image"), false);
});

test("screenshot reuses a live frame while the checked page stays readable", async () => {
  const { calls, cacheFetches, result } = await invokeScreenshot([{
    ok: true,
    result: [{ profile: "default", active: true, modelReadable: true, url: "https://example.test/watch" }],
  }]);
  assert.equal(cacheFetches, 1);
  assert.equal(calls.includes("browser_screenshot"), false);
  assert.equal(result.content?.some((item) => item.type === "image"), true);
});

test("screenshot discards a cached frame if the page becomes privileged", async () => {
  const { calls, cacheFetches, result } = await invokeScreenshot([{
    ok: true,
    result: [{ profile: "default", active: true, modelReadable: true, url: "https://example.test/watch" }],
  }, {
    ok: true,
    result: [{ profile: "default", active: true, modelReadable: false }],
  }]);
  assert.equal(cacheFetches, 1);
  assert.ok(calls.includes("browser_screenshot"));
  assert.equal(result.content?.some((item) => item.type === "image"), false);
});
