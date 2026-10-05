import { useStore } from "@/lib/store";
import type { IcalEventDTO } from "@/lib/ical/types";

const STALE_MS = 60 * 60 * 1000; // 1 hour

interface IcalApiResponse {
  events?: IcalEventDTO[];
  error?: string;
}

async function parseJsonSafe(res: Response): Promise<IcalApiResponse> {
  try {
    return (await res.json()) as IcalApiResponse;
  } catch {
    return {};
  }
}

/** Thrown when the request never reached the server (offline, DNS, dropped): not a problem with the feed. */
export class NetworkError extends Error {}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Fetches and parses a feed via the server-side /api/ical route (CORS proxy). */
export async function fetchFeed(url: string): Promise<IcalEventDTO[]> {
  if (isOffline()) throw new NetworkError("Nincs kapcsolat");
  let res: Response;
  try {
    res = await fetch("/api/ical", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new NetworkError("Nincs kapcsolat");
  }
  const json = await parseJsonSafe(res);

  if (!res.ok) {
    throw new Error(json.error ?? "A naptár nem érhető el");
  }
  if (!Array.isArray(json.events)) {
    throw new Error("Hibás válasz a szervertől");
  }
  return json.events;
}

/**
 * Syncs a single feed by id, reading and writing the store directly via
 * getState() so it can run outside of React (e.g. from AppShell's effect).
 */
export async function syncFeed(feedId: string): Promise<void> {
  const { feeds, applyFeedSync, updateFeed } = useStore.getState();
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) return;

  try {
    const events = await fetchFeed(feed.url);
    applyFeedSync(feedId, events);
  } catch (err) {
    // No connection says nothing about the feed (and lastError is a synced change): skip quietly.
    if (err instanceof NetworkError) return;
    const message = err instanceof Error ? err.message : "A naptár nem érhető el";
    updateFeed(feedId, { lastError: message });
  }
}

/**
 * Syncs every feed. With { staleOnly: true }, only feeds whose lastSyncedAt
 * is missing or older than an hour are synced.
 */
export async function syncAllFeeds(opts?: { staleOnly?: boolean }): Promise<void> {
  if (isOffline()) return;
  const { feeds } = useStore.getState();
  const now = Date.now();

  const targets = feeds.filter((feed) => {
    if (!opts?.staleOnly) return true;
    if (!feed.lastSyncedAt) return true;
    return now - new Date(feed.lastSyncedAt).getTime() > STALE_MS;
  });

  await Promise.all(targets.map((feed) => syncFeed(feed.id)));
}
