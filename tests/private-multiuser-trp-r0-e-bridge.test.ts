import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { brandHumanUserId } from "../src/route-identity.js";
import { WorkerEnrollmentStore } from "../src/worker-enrollment-store.js";
import { WorkerConnectionRegistry } from "../src/worker-connection-registry.js";
import { createPrivateTrustedWorkerGateway } from "../src/private-trusted-worker-gateway.js";

test("private trusted producer fails closed unless exactly one owner device is current", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-r0-e-bridge-"));
  try {
    const owner = brandHumanUserId("owner");
    const store = new WorkerEnrollmentStore(home);
    const registry = new WorkerConnectionRegistry(store);
    const gateway = createPrivateTrustedWorkerGateway(registry, owner);
    assert.deepEqual(await gateway.call("browser_open", { profile: "default" }), { ok: false, error: "no_target" });
    const enroll = async () => {
      const challenge = await store.issueChallenge(owner);
      return store.redeem(challenge.challenge, randomUUID());
    };
    const a = await enroll();
    const first = await registry.openSession(a.deviceId, a.credential);
    const pending = gateway.call("browser_open", { profile: "default" });
    const handle = await registry.authenticateWorkerSession(first.sessionCredential);
    assert(handle);
    const command = await handle.nextCommand(1);
    assert(command);
    assert.equal(command.action, "browser_open");
    assert.equal(await handle.complete(command.id, { ok: true, result: "trusted" }), true);
    assert.equal((await pending).result, "trusted");
    const b = await enroll();
    await registry.openSession(b.deviceId, b.credential);
    assert.deepEqual(await gateway.call("browser_open", { profile: "default" }), { ok: false, error: "no_target" });
    await registry.revokeDevice(a.deviceId);
    const response = gateway.human("human_preview", { profile: "default" });
    const second = await registry.resolveActiveConnection(owner, b.deviceId);
    assert(second);
    const secondCommand = await second.nextCommand(1);
    assert(secondCommand);
    assert.equal(await second.complete(secondCommand.id, { ok: true }), true);
    assert.equal((await response).ok, true);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
