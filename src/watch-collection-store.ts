import os from "node:os";
import path from "node:path";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  PRIVATE_WATCH_COLLECTION_ID,
  PRIVATE_WATCH_COLLECTION_OWNERSHIP,
  privateCollectionOwnership,
} from "./private-persistent-owner.js";
import { brandCollectionId } from "./route-identity.js";

const COLLECTION_ID_RE = /^[A-Za-z0-9_-]{24,96}$/;
// v90: tickets follow the user, not a card. Each card/host sandbox used to mint
// its own random collection in localStorage, scattering tickets across many
// collections. The daemon now always uses this single owner collection.
export const OWNER_WATCH_COLLECTION_ID = PRIVATE_WATCH_COLLECTION_ID;
export const OWNER_WATCH_COLLECTION_OWNERSHIP =
  PRIVATE_WATCH_COLLECTION_OWNERSHIP;
const TICKET_ID_RE = /^[A-Za-z0-9_-]{10,96}$/;
const MAX_TICKETS = 240;
const MAX_IMAGE_BYTES = 2_500_000;
const ROOT =
  process.env.TONGPING_WATCH_COLLECTION_ROOT?.trim() ||
  path.join((process.env.TONGPING_HOME?.trim() || path.join(os.homedir(), ".tongping")), "watch-collections");

export interface WatchTicketRecord {
  id: string;
  title: string;
  platform: string;
  url: string;
  watchedAt: string;
  createdAt: string;
  imageMimeType: "image/jpeg" | "image/png";
}

interface WatchCollectionDocument {
  version: 1;
  collectionId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  tickets: WatchTicketRecord[];
}

export interface WatchCollectionLimits {
  readonly maxTickets: number;
  readonly maxImageBytes: number;
}

export class WatchCollectionStore {
  constructor(
    private readonly rootDir = ROOT,
    private readonly limits: WatchCollectionLimits = { maxTickets: MAX_TICKETS, maxImageBytes: MAX_IMAGE_BYTES },
  ) {}

  /**
   * M1-E compatibility ownership metadata only.
   *
   * This does not authorize access and does not claim runtime multi-user
   * isolation. The current private store is interpreted as belonging to the
   * synthetic private human owner.
   */
  ownership(collectionId: string) {
    assertCollectionId(collectionId);
    return privateCollectionOwnership(brandCollectionId(collectionId));
  }

  async get(collectionId: string): Promise<WatchCollectionDocument | null> {
    assertCollectionId(collectionId);
    try {
      const raw = await readFile(this.metaPath(collectionId), "utf8");
      const parsed = JSON.parse(raw) as WatchCollectionDocument;
      if (
        parsed.version !== 1 ||
        parsed.collectionId !== collectionId ||
        !Array.isArray(parsed.tickets)
      ) {
        return null;
      }
      return {
        ...parsed,
        tickets: parsed.tickets.slice(-this.limits.maxTickets),
      };
    } catch {
      return null;
    }
  }

  async enable(collectionId: string): Promise<WatchCollectionDocument> {
    assertCollectionId(collectionId);
    const now = new Date().toISOString();
    const current = await this.get(collectionId);
    const next: WatchCollectionDocument = current
      ? {
          ...current,
          enabled: true,
          updatedAt: now,
        }
      : {
          version: 1,
          collectionId,
          enabled: true,
          createdAt: now,
          updatedAt: now,
          tickets: [],
        };
    await this.write(next);
    return next;
  }

  async disable(collectionId: string): Promise<WatchCollectionDocument> {
    assertCollectionId(collectionId);
    const current = await this.get(collectionId);
    if (!current) {
      return {
        version: 1,
        collectionId,
        enabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tickets: [],
      };
    }
    const next = {
      ...current,
      enabled: false,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async add(
    collectionId: string,
    input: {
      id: string;
      title: string;
      platform: string;
      url: string;
      watchedAt: string;
      imageMimeType: "image/jpeg" | "image/png";
      imageBase64: string;
    },
  ): Promise<WatchCollectionDocument> {
    assertCollectionId(collectionId);
    assertTicketId(input.id);
    const current = await this.get(collectionId);
    if (!current?.enabled) {
      throw new Error("Watch collection is not enabled.");
    }

    const image = Buffer.from(input.imageBase64, "base64");
    if (
      image.length < 32 ||
      image.length > this.limits.maxImageBytes
    ) {
      throw new Error("Ticket image is outside the allowed size.");
    }

    // Never overwrite an existing ticket that happens to share a number
    // (cards numbered tickets per sandbox, so MB-…-001 repeats).
    let ticketId = input.id;
    for (let n = 2; current.tickets.some((item) => item.id === ticketId); n++) {
      ticketId = (input.id + "-" + n).slice(0, 96);
    }
    const record: WatchTicketRecord = {
      id: ticketId,
      title: clean(input.title, 240),
      platform: clean(input.platform, 80),
      url: cleanUrl(input.url),
      watchedAt: cleanIso(input.watchedAt),
      createdAt: new Date().toISOString(),
      imageMimeType: input.imageMimeType,
    };

    const dir = this.dir(collectionId);
    await mkdir(dir, { recursive: true });
    const ext = input.imageMimeType === "image/png" ? "png" : "jpg";
    await writeFile(path.join(dir, record.id + "." + ext), image);

    const tickets = current.tickets
      .filter((item) => item.id !== record.id)
      .concat(record)
      .slice(-this.limits.maxTickets);
    const next: WatchCollectionDocument = {
      ...current,
      tickets,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async remove(
    collectionId: string,
    ticketId: string,
  ): Promise<WatchCollectionDocument | null> {
    assertCollectionId(collectionId);
    assertTicketId(ticketId);
    const current = await this.get(collectionId);
    if (!current) return null;

    const ticket = current.tickets.find((item) => item.id === ticketId);
    if (ticket) {
      const ext = ticket.imageMimeType === "image/png" ? "png" : "jpg";
      try {
        await unlink(path.join(this.dir(collectionId), ticketId + "." + ext));
      } catch {}
    }

    const next = {
      ...current,
      tickets: current.tickets.filter((item) => item.id !== ticketId),
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async clear(collectionId: string): Promise<WatchCollectionDocument | null> {
    assertCollectionId(collectionId);
    const current = await this.get(collectionId);
    if (!current) return null;

    const dir = this.dir(collectionId);
    try {
      const names = await readdir(dir);
      await Promise.all(
        names
          .filter((name) => /.(?:jpg|png)$/i.test(name))
          .map((name) => unlink(path.join(dir, name)).catch(() => {})),
      );
    } catch {}

    const next = {
      ...current,
      tickets: [],
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    return next;
  }

  async image(
    collectionId: string,
    ticketId: string,
  ): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" } | null> {
    assertCollectionId(collectionId);
    assertTicketId(ticketId);
    const current = await this.get(collectionId);
    const ticket = current?.tickets.find((item) => item.id === ticketId);
    if (!ticket) return null;
    const ext = ticket.imageMimeType === "image/png" ? "png" : "jpg";
    try {
      const buffer = await readFile(
        path.join(this.dir(collectionId), ticketId + "." + ext),
      );
      if (buffer.length < 1 || buffer.length > this.limits.maxImageBytes) return null;
      return { buffer, mimeType: ticket.imageMimeType };
    } catch {
      return null;
    }
  }

  async destroy(collectionId: string): Promise<void> {
    assertCollectionId(collectionId);
    await rm(this.dir(collectionId), {
      recursive: true,
      force: true,
    });
  }

  private dir(collectionId: string): string {
    return path.join(this.rootDir, collectionId);
  }

  private metaPath(collectionId: string): string {
    return path.join(this.dir(collectionId), "collection.json");
  }

  private async write(doc: WatchCollectionDocument): Promise<void> {
    const dir = this.dir(doc.collectionId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      this.metaPath(doc.collectionId),
      JSON.stringify(doc, null, 2) + "\n",
      "utf8",
    );
  }
}

function assertCollectionId(value: string): void {
  if (!COLLECTION_ID_RE.test(value)) {
    throw new Error("Invalid watch collection id.");
  }
}

function assertTicketId(value: string): void {
  if (!TICKET_ID_RE.test(value)) {
    throw new Error("Invalid watch ticket id.");
  }
}

function clean(value: string, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function cleanUrl(value: string): string {
  const text = String(value ?? "").trim().slice(0, 1800);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function cleanIso(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : new Date().toISOString();
}
