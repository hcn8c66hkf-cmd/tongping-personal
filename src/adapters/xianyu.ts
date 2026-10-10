import type { BrowserGateway } from "../gateway.js";

export interface XianyuSearchItem {
  id: string;
  url: string;
  ref: string;
  text: string;
  price?: number;
}

interface SnapshotElement {
  ref: string;
  tag: string;
  role: string | null;
  text: string;
  href: string | null;
}

interface SnapshotResult {
  title: string;
  url: string;
  elements: SnapshotElement[];
}

interface ReadResult {
  title: string;
  url: string;
  text: string;
}

export function xianyuSearchUrl(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Xianyu search query cannot be empty.");
  const url = new URL("https://www.goofish.com/search");
  url.searchParams.set("q", trimmed);
  return url.toString();
}

export function xianyuItemUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Xianyu item id or URL cannot be empty.");

  if (/^\d{6,}$/.test(trimmed)) {
    return `https://www.goofish.com/item?id=${trimmed}`;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Xianyu item must be a numeric id or goofish.com item URL.");
  }

  if (!isGoofishHost(url.hostname)) {
    throw new Error("Xianyu item URL must use goofish.com.");
  }

  const id = url.searchParams.get("id")?.trim();
  if (!id || !/^\d{6,}$/.test(id)) {
    throw new Error("Xianyu item URL is missing a valid numeric id.");
  }

  return `https://www.goofish.com/item?id=${id}`;
}

export function normalizeXianyuSearchItems(
  elements: SnapshotElement[],
  maxResults = 20,
): XianyuSearchItem[] {
  const byId = new Map<string, XianyuSearchItem>();

  for (const element of elements) {
    if (!element.href) continue;

    let url: URL;
    try {
      url = new URL(element.href);
    } catch {
      continue;
    }

    if (!isGoofishHost(url.hostname)) continue;
    if (url.pathname !== "/item") continue;

    const id = url.searchParams.get("id")?.trim();
    if (!id || !/^\d{6,}$/.test(id)) continue;

    const existing = byId.get(id);
    const text = cleanText(element.text);
    const item: XianyuSearchItem = {
      id,
      url: `https://www.goofish.com/item?id=${id}`,
      ref: element.ref,
      text,
      price: parsePrice(text),
    };

    if (!existing || item.text.length > existing.text.length) {
      byId.set(id, item);
    }

    if (byId.size >= maxResults) break;
  }

  return [...byId.values()];
}

export async function xianyuSearch(
  gateway: BrowserGateway,
  input: {
    profile: string;
    query: string;
    maxResults?: number;
  },
): Promise<{
  query: string;
  searchUrl: string;
  title: string;
  url: string;
  items: XianyuSearchItem[];
  pageText: string;
}> {
  const maxResults = clamp(input.maxResults ?? 20, 1, 50);
  const searchUrl = xianyuSearchUrl(input.query);

  await must(
    gateway.call("browser_open", {
      profile: input.profile,
      url: searchUrl,
    }),
  );

  await must(
    gateway.call("browser_wait", {
      profile: input.profile,
      ms: 900,
    }),
  );

  const [snapshot, read] = await Promise.all([
    must<SnapshotResult>(
      gateway.call("browser_snapshot", {
        profile: input.profile,
        maxElements: 250,
      }),
    ),
    must<ReadResult>(
      gateway.call("browser_read", {
        profile: input.profile,
        selector: "body",
        maxChars: 30_000,
      }),
    ),
  ]);

  return {
    query: input.query.trim(),
    searchUrl,
    title: read.title || snapshot.title,
    url: read.url || snapshot.url,
    items: normalizeXianyuSearchItems(
      snapshot.elements,
      maxResults,
    ),
    pageText: read.text,
  };
}

export async function xianyuOpenItem(
  gateway: BrowserGateway,
  input: {
    profile: string;
    item: string;
  },
): Promise<{
  itemUrl: string;
  title: string;
  url: string;
  text: string;
  elements: SnapshotElement[];
}> {
  const itemUrl = xianyuItemUrl(input.item);

  await must(
    gateway.call("browser_open", {
      profile: input.profile,
      url: itemUrl,
    }),
  );

  await must(
    gateway.call("browser_wait", {
      profile: input.profile,
      ms: 700,
    }),
  );

  const [snapshot, read] = await Promise.all([
    must<SnapshotResult>(
      gateway.call("browser_snapshot", {
        profile: input.profile,
        maxElements: 180,
      }),
    ),
    must<ReadResult>(
      gateway.call("browser_read", {
        profile: input.profile,
        selector: "body",
        maxChars: 25_000,
      }),
    ),
  ]);

  return {
    itemUrl,
    title: read.title || snapshot.title,
    url: read.url || snapshot.url,
    text: read.text,
    elements: snapshot.elements,
  };
}

function parsePrice(text: string): number | undefined {
  const match = text.match(
    /(?:¥|￥)\s*([0-9]+(?:\.[0-9]{1,2})?)/,
  );
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function isGoofishHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "goofish.com" || lower.endsWith(".goofish.com");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function must<T>(
  promise: Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
  }>,
): Promise<T> {
  const reply = await promise;
  if (!reply.ok) {
    throw new Error(reply.error ?? "Browser action failed.");
  }
  return reply.result as T;
}
