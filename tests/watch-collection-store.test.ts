import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { WatchCollectionStore } from "../src/watch-collection-store.js";

const COLLECTION = "abcdefghijklmnopqrstuvwx12345678";

test("watch collection is opt-in and refuses writes before enable", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-watch-"));
  const store = new WatchCollectionStore(root);

  assert.equal(await store.get(COLLECTION), null);

  await assert.rejects(
    () =>
      store.add(COLLECTION, {
        id: "ticket_1234567890",
        title: "Example",
        platform: "Bilibili",
        url: "https://www.bilibili.com/video/test",
        watchedAt: new Date().toISOString(),
        imageMimeType: "image/jpeg",
        imageBase64: Buffer.alloc(64, 7).toString("base64"),
      }),
    /not enabled/,
  );

  await rm(root, { recursive: true, force: true });
});

test("disable keeps tickets while clear removes ticket files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-watch-"));
  const store = new WatchCollectionStore(root);

  await store.enable(COLLECTION);
  const doc = await store.add(COLLECTION, {
    id: "ticket_1234567890",
    title: "零号档案",
    platform: "抖音",
    url: "https://www.douyin.com/video/123",
    watchedAt: new Date().toISOString(),
    imageMimeType: "image/jpeg",
    imageBase64: Buffer.alloc(128, 9).toString("base64"),
  });

  assert.equal(doc.enabled, true);
  assert.equal(doc.tickets.length, 1);

  const disabled = await store.disable(COLLECTION);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.tickets.length, 1);
  assert.ok(await store.image(COLLECTION, "ticket_1234567890"));

  const cleared = await store.clear(COLLECTION);
  assert.equal(cleared?.tickets.length, 0);
  assert.equal(await store.image(COLLECTION, "ticket_1234567890"), null);

  await rm(root, { recursive: true, force: true });
});

test("destroy removes the entire pseudonymous collection", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-watch-"));
  const store = new WatchCollectionStore(root);

  await store.enable(COLLECTION);
  await store.destroy(COLLECTION);
  assert.equal(await store.get(COLLECTION), null);

  await rm(root, { recursive: true, force: true });
});
