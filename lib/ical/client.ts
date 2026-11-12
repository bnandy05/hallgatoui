import { isDemoFeedId } from "@/lib/demoMode";
import { currentMessages } from "@/lib/i18n/clientLocale";
import { useStore } from "@/lib/store";
import type { IcalEventDTO } from "@/lib/ical/types";

const STALE_MS = 60 * 60 * 1000; // 1 hour
const RETRY_AFTER_MS = 60_000;
const inFlight = new Map<string, Promise<void>>();
const lastFailure = new Map<string, number>();

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

/** Thrown on a 401: the session expired, which says nothing about the feed. */
export class SignedOutError extends Error {}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Fetches and parses a feed via the server-side /api/ical route (CORS proxy). */
export async function fetchFeed(url: string, signal?: AbortSignal): Promise<IcalEventDTO[]> {
  if (isOffline()) throw new NetworkError(currentMessages().errors.no_connection);
  let res: Response;
  try {
    res = await fetch("/api/ical", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch {
    throw new NetworkError(currentMessages().errors.no_connection);
  }
  const json = await parseJsonSafe(res);

  if (res.status === 401) throw new SignedOutError(json.error ?? currentMessages().errors.not_signed_in);
  if (!res.ok) {
    throw new Error(json.error ?? currentMessages().errors.ical_unreachable);
  }
  if (!Array.isArray(json.events)) {
    throw new Error(currentMessages().errors.bad_response);
  }
  return json.events;
}

/**
 * Syncs a single feed by id, reading and writing the store directly via
 * getState() so it can run outside of React (e.g. from AppShell's effect).
 */
export function syncFeed(feedId: string, automatic = false): Promise<void> {
  const { feeds, ownerUserId, semesterNumber } = useStore.getState();
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed || isOffline() || isDemoFeedId(feed.id)) return Promise.resolve();
  const key = JSON.stringify([ownerUserId, semesterNumber, feedId, feed.url]);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const now = Date.now();
  for (const [failedKey, at] of lastFailure) {
    if (now - at >= RETRY_AFTER_MS) lastFailure.delete(failedKey);
  }
  if (automatic && lastFailure.has(key)) return Promise.resolve();

  const currentStore = () => {
    const current = useStore.getState();
    return current.ownerUserId === ownerUserId && current.semesterNumber === semesterNumber &&
      current.feeds.some((f) => f.id === feedId && f.url === feed.url)
      ? current : null;
  };
  const refresh = fetchFeed(feed.url).then((events) => {
    currentStore()?.applyFeedSync(feedId, events);
    lastFailure.delete(key);
  }).catch((err: unknown) => {
    // Retry a connection failure immediately on reconnect. It says nothing about the source.
    if (err instanceof NetworkError || err instanceof SignedOutError) return;
    const current = currentStore();
    if (!current) return;
    lastFailure.set(key, Date.now());
    const message = err instanceof Error ? err.message : currentMessages().errors.ical_unreachable;
    current.updateFeed(feedId, { lastError: message });
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, refresh);
  return refresh;
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

  await Promise.all(targets.map((feed) => syncFeed(feed.id, opts?.staleOnly)));
}
