import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (name: string) =>
  fs.readFileSync(new URL("../src/" + name, import.meta.url), "utf8");

test("claude.ai sessions drop domain/openai meta and default to the claude identity", () => {
  const mcp = read("mcp-server.ts");
  assert.match(mcp, /const claudeHostSession = options\.claudeHost === true/);
  assert.match(mcp, /if \(claudeHostSession\) delete \(uiMeta as Record<string, unknown>\)\.domain/);
  assert.match(mcp, /delete browserAppToolMeta\["openai\/outputTemplate"\]/);
  assert.match(mcp, /const defaultIdentity = claudeHostSession \? "claude\.chat" : "gpt\.chat"/);
  const daemon = read("daemon.ts");
  assert.match(daemon, /claudeHost: requestFromClaudeHost\(ctx\?\.requestInfo\)/);
});

test("a companion pause is retried and re-applied to a replacement recorder", () => {
  const daemon = read("daemon.ts");
  assert.match(daemon, /function pushCompanionPauseToWorker\(/);
  assert.match(daemon, /if \(!reply\.ok\) retry\(\)/);
  assert.match(
    daemon,
    /onWorkerStreamStart:[\s\S]*?companionPausedProfiles\.has\(profile\)[\s\S]*?pushCompanionPauseToWorker\(profile, true\)/,
  );
});
