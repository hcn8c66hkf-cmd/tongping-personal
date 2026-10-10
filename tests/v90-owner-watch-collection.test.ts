import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OWNER_WATCH_COLLECTION_ID, WatchCollectionStore } from "../src/watch-collection-store.js";

const png = Buffer.alloc(64, 7).toString("base64");

test("a ticket number that already exists is kept and the new one is suffixed", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mb-owner-"));
  const store = new WatchCollectionStore(root);
  await store.enable(OWNER_WATCH_COLLECTION_ID);
  const ticket = { id: "MB-20260927-001", title: "a", platform: "p", url: "https://example.test/", watchedAt: new Date().toISOString(), imageMimeType: "image/png" as const, imageBase64: png };
  await store.add(OWNER_WATCH_COLLECTION_ID, ticket);
  const doc = await store.add(OWNER_WATCH_COLLECTION_ID, { ...ticket, title: "b" });
  assert.deepEqual(doc.tickets.map((t) => t.id), ["MB-20260927-001", "MB-20260927-001-2"]);
  assert.equal(doc.tickets[0]!.title, "a");
});

test("the daemon always serves the single owner collection", () => {
  const daemon = fs.readFileSync(new URL("../src/daemon.ts", import.meta.url), "utf8");
  assert.equal((daemon.match(/const collectionId = OWNER_WATCH_COLLECTION_ID;/g) ?? []).length, 3);
});
