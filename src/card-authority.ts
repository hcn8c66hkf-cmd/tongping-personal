// Newest-card-wins across the app's live and media sockets. Each the user
// Browser card stamps its sockets with the moment it was opened; ticket
// expiry cannot rank cards any more because every open card renews its
// tickets. Sockets without a stamp (older cards) only count until a
// stamped card has connected.
//
// v90: authority is held only while the newest card still has sockets (plus
// a short grace for reconnect gaps). Before this, the newest stamp stuck
// forever: once that card was closed, every still-open older card was
// refused with 409 on each reconnect until the daemon restarted.
const CARD_RELEASE_GRACE_MS = 20_000;

// One newest-card room per scope. The personal daemon uses the single
// default scope; the hosted service scopes by owner/device/profile so one
// user's card can never outrank another user's.
interface CardRoom {
  readonly sockets: Set<{ card: number; close: () => void }>;
  readonly lastSeenAt: Map<number, number>;
}
const rooms = new Map<string, CardRoom>();

function room(scope: string): CardRoom {
  let current = rooms.get(scope);
  if (!current) {
    current = { sockets: new Set(), lastSeenAt: new Map() };
    rooms.set(scope, current);
  }
  return current;
}

function currentNewestCard(state: CardRoom, now: number): number {
  let newest = 0;
  for (const entry of state.sockets) {
    if (entry.card > newest) newest = entry.card;
  }
  for (const [card, lastSeenAt] of [...state.lastSeenAt]) {
    if (now - lastSeenAt > CARD_RELEASE_GRACE_MS) {
      state.lastSeenAt.delete(card);
      continue;
    }
    if (card > newest) newest = card;
  }
  return newest;
}

export function cardFromUrl(url: URL): number {
  const raw = Number(url.searchParams.get("card") ?? "0");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function admitCard(card: number, now = Date.now(), scope = ""): boolean {
  const state = room(scope);
  const newestCard = currentNewestCard(state, now);
  if (card > newestCard) {
    for (const entry of [...state.sockets]) {
      if (entry.card < card) {
        state.sockets.delete(entry);
        try { entry.close(); } catch {}
      }
    }
    for (const older of [...state.lastSeenAt.keys()]) {
      if (older < card) state.lastSeenAt.delete(older);
    }
    state.lastSeenAt.set(card, now);
    return true;
  }
  if (card >= newestCard) {
    state.lastSeenAt.set(card, now);
    return true;
  }
  return false;
}

export function registerCardSocket(card: number, close: () => void, scope = ""): () => void {
  const state = room(scope);
  const entry = { card, close };
  state.sockets.add(entry);
  state.lastSeenAt.set(card, Date.now());
  return () => {
    if (state.sockets.delete(entry)) state.lastSeenAt.set(card, Date.now());
    if (scope && state.sockets.size === 0 && state.lastSeenAt.size === 0) rooms.delete(scope);
  };
}

export function resetCardAuthorityForTests(): void {
  rooms.clear();
}
