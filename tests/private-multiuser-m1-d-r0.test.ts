import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CompanionFrameBuffer } from "../src/companion-frame-buffer.js";
import { HostedProfileBindingStore, resolveVerifiedRoute } from "../src/hosted-profile-binding-store.js";
import { readPrivateTrustedCompanionFrame, readPrivateTrustedCompanionFrameStatus, resolvePrivateTrustedCompanionRoute } from "../src/private-trusted-companion-frame.js";
import { routeScopeKey } from "../src/route-keys.js";
import { brandHumanUserId } from "../src/route-identity.js";
import { WorkerEnrollmentStore } from "../src/worker-enrollment-store.js";
import { WorkerConnectionRegistry } from "../src/worker-connection-registry.js";

async function fixture(run: (value: {
  home: string; bindings: HostedProfileBindingStore; registry: WorkerConnectionRegistry;
  a: Awaited<ReturnType<WorkerEnrollmentStore["redeem"]>>;
  b: Awaited<ReturnType<WorkerEnrollmentStore["redeem"]>>;
  sameOwner: Awaited<ReturnType<WorkerEnrollmentStore["redeem"]>>;
}) => Promise<void>) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tongping-m1-d-r0-"));
  try {
    const enrollment = new WorkerEnrollmentStore(home);
    const enroll = async (owner: string) => {
      const { challenge } = await enrollment.issueChallenge(brandHumanUserId(owner));
      return enrollment.redeem(challenge, randomUUID());
    };
    const a = await enroll("owner-a");
    const b = await enroll("owner-b");
    const sameOwner = await enroll("owner-a");
    await run({ home, bindings: new HostedProfileBindingStore(home), registry: new WorkerConnectionRegistry(enrollment), a, b, sameOwner });
  } finally { await fs.rm(home, { recursive: true, force: true }); }
}

const frame = (sequence: number) => ({ buffer: Buffer.from([sequence]), viewport: null, sequence, capturedAt: sequence });

test("server owns durable opaque HostedProfileId; alias, device and owner cannot override it", async () => {
  await fixture(async ({ home, bindings, registry, a, b, sameOwner }) => {
    const as = await registry.openSession(a.deviceId, a.credential);
    const bs = await registry.openSession(b.deviceId, b.credential);
    const cs = await registry.openSession(sameOwner.deviceId, sameOwner.credential);
    const ah = (await registry.authenticateWorkerSession(as.sessionCredential))!;
    const bh = (await registry.authenticateWorkerSession(bs.sessionCredential))!;
    const ch = (await registry.authenticateWorkerSession(cs.sessionCredential))!;
    const ar = (await resolveVerifiedRoute(ah, "default", bindings))!;
    const br = (await resolveVerifiedRoute(bh, "default", bindings))!;
    const cr = (await resolveVerifiedRoute(ch, "default", bindings))!;
    assert.match(ar.profileId, /^[0-9a-f-]{36}$/);
    assert.notEqual(ar.profileId, "default");
    assert.notEqual(ar.profileId, br.profileId);
    assert.notEqual(ar.profileId, cr.profileId);
    assert.equal(ar.humanUserId, a.humanUserId);
    assert.equal(ar.deviceId, a.deviceId);
    assert.equal(ar.sessionId, as.context.sessionId);
    const reconstructed = new HostedProfileBindingStore(home);
    assert.equal((await resolveVerifiedRoute(ah, "default", reconstructed))?.profileId, ar.profileId);
    const replaced = await registry.openSession(a.deviceId, a.credential);
    assert.equal(await resolveVerifiedRoute(ah, "default", bindings), null);
    const next = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(replaced.sessionCredential))!, "default", bindings))!;
    assert.equal(next.profileId, ar.profileId);
    assert.notEqual(routeScopeKey(next), routeScopeKey(ar));
  });
});

test("corrupt or disappeared profile binding state fails closed", async () => {
  await fixture(async ({ home, bindings, registry, a }) => {
    const session = await registry.openSession(a.deviceId, a.credential);
    const handle = (await registry.authenticateWorkerSession(session.sessionCredential))!;
    await resolveVerifiedRoute(handle, "default", bindings);
    const file = path.join(home, "worker-profile-bindings-v1.json");
    await fs.writeFile(file, "{bad");
    await assert.rejects(resolveVerifiedRoute(handle, "default", new HostedProfileBindingStore(home)), /Invalid hosted profile binding state/);
    await fs.rm(file);
    await assert.rejects(resolveVerifiedRoute(handle, "default", bindings), /disappeared/);
  });
});

test("real A/default and B/default routes isolate read, clear, eviction and replacement", async () => {
  await fixture(async ({ bindings, registry, a, b }) => {
    const as = await registry.openSession(a.deviceId, a.credential);
    const bs = await registry.openSession(b.deviceId, b.credential);
    const ar = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(as.sessionCredential))!, "default", bindings))!;
    const br = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(bs.sessionCredential))!, "default", bindings))!;
    const buffer = new CompanionFrameBuffer();
    assert.notEqual(routeScopeKey(ar), routeScopeKey(br));
    buffer.push(ar, frame(1), 1_000);
    assert.equal(buffer.select(br, 0, 1_000), null);
    assert.equal(buffer.selectLegacy("default", 0, 1_000), null);
    assert.equal(buffer.statusLegacy("default", 1_000).frames, 0);
    buffer.clearLegacy("default");
    assert.equal(buffer.select(ar, 0, 1_000)?.sequence, 1);
    buffer.push(br, frame(2), 1_000);
    assert.equal(buffer.select(ar, 0, 1_000)?.sequence, 1);
    assert.equal(buffer.select(br, 0, 1_000)?.sequence, 2);
    buffer.clear(br);
    assert.equal(buffer.select(ar, 0, 1_000)?.sequence, 1);
    buffer.push(br, frame(3), 1_000);
    buffer.clear(ar);
    assert.equal(buffer.select(br, 0, 1_000)?.sequence, 3);
    assert.throws(() => buffer.select("default" as never), /RouteScope/);
    assert.throws(() => buffer.status("default" as never), /RouteScope/);
    assert.throws(() => buffer.clear("default" as never), /RouteScope/);
    const nextSession = await registry.openSession(b.deviceId, b.credential);
    const nextRoute = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(nextSession.sessionCredential))!, "default", bindings))!;
    assert.equal(nextRoute.profileId, br.profileId);
    assert.equal(buffer.select(nextRoute, 0, 1_000), null);
    buffer.push(nextRoute, frame(4), 1_000);
    buffer.clear(br); // Old generation cleanup is exact-route only.
    assert.equal(buffer.select(nextRoute, 0, 1_000)?.sequence, 4);
  });
});

test("private trusted read bridge fails closed for zero or multiple current devices", async () => {
  await fixture(async ({ bindings, registry, a, sameOwner }) => {
    const buffer = new CompanionFrameBuffer();
    assert.equal(await readPrivateTrustedCompanionFrame(registry, bindings, a.humanUserId, buffer, "default"), null);
    const as = await registry.openSession(a.deviceId, a.credential);
    const ar = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(as.sessionCredential))!, "default", bindings))!;
    buffer.push(ar, frame(1));
    assert.equal((await readPrivateTrustedCompanionFrame(registry, bindings, a.humanUserId, buffer, "default"))?.sequence, 1);
    await registry.openSession(sameOwner.deviceId, sameOwner.credential);
    assert.equal(await readPrivateTrustedCompanionFrame(registry, bindings, a.humanUserId, buffer, "default"), null);
    await registry.revokeDevice(sameOwner.deviceId);
    assert.equal((await readPrivateTrustedCompanionFrame(registry, bindings, a.humanUserId, buffer, "default"))?.sequence, 1);
  });
});

test("private trusted status is route-scoped and fails closed for zero, ambiguity and replacement", async () => {
  await fixture(async ({ bindings, registry, a, b, sameOwner }) => {
    const buffer = new CompanionFrameBuffer();

    const bs = await registry.openSession(b.deviceId, b.credential);
    const br = (await resolveVerifiedRoute(
      (await registry.authenticateWorkerSession(bs.sessionCredential))!,
      "default",
      bindings,
    ))!;
    buffer.push(br, { ...frame(2), buffer: Buffer.alloc(11, 2) });
    assert.equal(
      await readPrivateTrustedCompanionFrameStatus(
        registry, bindings, a.humanUserId, buffer, "default",
      ),
      null,
      "owner A has no current Worker, even though owner B has buffered frames",
    );

    const as = await registry.openSession(a.deviceId, a.credential);
    const ar = (await resolveVerifiedRoute(
      (await registry.authenticateWorkerSession(as.sessionCredential))!,
      "default",
      bindings,
    ))!;
    buffer.push(ar, { ...frame(1), buffer: Buffer.alloc(7, 1) });

    const aStatus = await readPrivateTrustedCompanionFrameStatus(
      registry, bindings, a.humanUserId, buffer, "default",
    );
    const bStatus = await readPrivateTrustedCompanionFrameStatus(
      registry, bindings, b.humanUserId, buffer, "default",
    );
    assert.equal(aStatus?.frames, 1);
    assert.equal(aStatus?.bytes, 7);
    assert.equal(bStatus?.frames, 1);
    assert.equal(bStatus?.bytes, 11);

    await registry.openSession(sameOwner.deviceId, sameOwner.credential);
    assert.equal(
      await readPrivateTrustedCompanionFrameStatus(
        registry, bindings, a.humanUserId, buffer, "default",
      ),
      null,
      "multiple current devices for the private owner must fail closed",
    );

    await registry.revokeDevice(sameOwner.deviceId);
    assert.equal(
      (await readPrivateTrustedCompanionFrameStatus(
        registry, bindings, a.humanUserId, buffer, "default",
      ))?.bytes,
      7,
    );

    await registry.openSession(a.deviceId, a.credential);
    const replacementStatus = await readPrivateTrustedCompanionFrameStatus(
      registry, bindings, a.humanUserId, buffer, "default",
    );
    assert.equal(replacementStatus?.frames, 0);
    assert.equal(replacementStatus?.bytes, 0);
  });
});

test("route resolver rejects its original handle when replacement wins during durable binding publish", async () => {
  await fixture(async ({ home, registry, a }) => {
    let entered!: () => void;
    let release!: () => void;
    const publishing = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const bindings = new HostedProfileBindingStore(home, async () => { entered(); await held; });
    const old = await registry.openSession(a.deviceId, a.credential);
    const handle = (await registry.authenticateWorkerSession(old.sessionCredential))!;
    const resolving = resolveVerifiedRoute(handle, "default", bindings);
    await publishing;
    const replacement = await registry.openSession(a.deviceId, a.credential);
    release();
    assert.equal(await resolving, null);
    const current = (await registry.authenticateWorkerSession(replacement.sessionCredential))!;
    assert.ok(await resolveVerifiedRoute(current, "default", bindings));
  });
});

test("private read bridge rechecks uniqueness after binding I/O", async () => {
  await fixture(async ({ home, registry, a, sameOwner }) => {
    let entered!: () => void;
    let release!: () => void;
    const publishing = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const bindings = new HostedProfileBindingStore(home, async () => { entered(); await held; });
    await registry.openSession(a.deviceId, a.credential);
    const reading = resolvePrivateTrustedCompanionRoute(registry, bindings, a.humanUserId, "default");
    await publishing;
    await registry.openSession(sameOwner.deviceId, sameOwner.credential);
    release();
    assert.equal(await reading, null);
  });
});

test("per-route eviction does not remove another real owner's frames", async () => {
  await fixture(async ({ bindings, registry, a, b }) => {
    const as = await registry.openSession(a.deviceId, a.credential);
    const bs = await registry.openSession(b.deviceId, b.credential);
    const ar = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(as.sessionCredential))!, "default", bindings))!;
    const br = (await resolveVerifiedRoute((await registry.authenticateWorkerSession(bs.sessionCredential))!, "default", bindings))!;
    const buffer = new CompanionFrameBuffer({ sampleIntervalMs: 100, maxBytesPerProfile: 1_000_000 });
    buffer.push(ar, { ...frame(1), buffer: Buffer.alloc(120_000, 1) }, 1_000);
    for (let n = 0; n < 12; n++) buffer.push(br, { ...frame(n + 2), buffer: Buffer.alloc(120_000, 2) }, 1_000 + n * 100);
    assert.equal(buffer.select(ar, 0, 2_100)?.sequence, 1);
    assert.ok(buffer.status(br, 2_100).bytes <= 1_000_000);
  });
});
