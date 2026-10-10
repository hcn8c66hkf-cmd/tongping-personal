import { randomBytes } from "node:crypto";
import type { OwnerScope } from "./route-identity.js";
import { ownerScopeKey } from "./route-keys.js";

export const SHARED_IMAGE_TTL_MS = 30 * 60_000;
export type SharedImageMime = "image/png" | "image/jpeg";
export interface SharedImageReceipt { readonly id: string; readonly expiresAt: number }
export interface SharedImageValue {
  readonly buffer: Buffer;
  readonly mimeType: SharedImageMime;
  readonly createdAt: number;
  readonly expiresAt: number;
}
interface Entry extends SharedImageValue { readonly owner: OwnerScope; readonly id: string }

/** A daemon-local store. Its trusted lookup always requires the owner. */
export class SharedImageStore {
  private readonly owners = new Map<string, Map<string, Entry>>();
  private readonly ids = new Set<string>();
  private readonly maxEntriesPerOwner: number;
  private readonly now: () => number;

  constructor(options: { maxEntriesPerOwner?: number; now?: () => number } = {}) {
    this.maxEntriesPerOwner = options.maxEntriesPerOwner ?? 40;
    if (!Number.isSafeInteger(this.maxEntriesPerOwner) || this.maxEntriesPerOwner < 1) throw new Error("Invalid shared image quota");
    this.now = options.now ?? Date.now;
  }

  put(owner: OwnerScope, buffer: Buffer, mimeType: SharedImageMime): SharedImageReceipt {
    const key = ownerScopeKey(owner);
    if (!Buffer.isBuffer(buffer) || !["image/png", "image/jpeg"].includes(mimeType)) throw new Error("Invalid shared image");
    const now = this.now();
    let bucket = this.owners.get(key);
    if (!bucket) { bucket = new Map(); this.owners.set(key, bucket); }
    this.prune(bucket, now);
    while (bucket.size >= this.maxEntriesPerOwner) {
      const oldest = bucket.keys().next().value;
      if (!oldest) break;
      bucket.delete(oldest);
      this.ids.delete(oldest);
    }
    let id: string;
    do { id = randomBytes(18).toString("base64url"); } while (this.ids.has(id));
    const expiresAt = now + SHARED_IMAGE_TTL_MS;
    bucket.set(id, { id, owner, buffer: Buffer.from(buffer), mimeType, createdAt: now, expiresAt });
    this.ids.add(id);
    return { id, expiresAt };
  }

  get(owner: OwnerScope, id: string): SharedImageValue | null {
    const key = ownerScopeKey(owner);
    const bucket = this.owners.get(key);
    if (!bucket) return null;
    const entry = bucket.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      bucket.delete(id);
      this.ids.delete(id);
      if (!bucket.size) this.owners.delete(key);
      return null;
    }
    return entry;
  }

  count(owner: OwnerScope): number {
    const key = ownerScopeKey(owner);
    const bucket = this.owners.get(key);
    if (!bucket) return 0;
    this.prune(bucket, this.now());
    if (!bucket.size) this.owners.delete(key);
    return bucket.size;
  }

  private prune(bucket: Map<string, Entry>, now: number): void {
    for (const [id, entry] of bucket) {
      if (entry.expiresAt <= now) { bucket.delete(id); this.ids.delete(id); }
    }
  }
}
