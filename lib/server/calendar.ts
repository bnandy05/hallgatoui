import type { Deadline, IcalFeed } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { buildCalendar, type HealthWarning } from "@/lib/ical/export";
import { fetchAndParseFeed } from "@/lib/ical/fetch";
import { parseView } from "@/lib/ical/views";
import { mergeFeedSync } from "@/lib/ical/sync";
import { trackDueChanges, type DueRecord } from "@/lib/server/dueChanges";
import type { Kv } from "@/lib/server/kv";
import {
  FEED_FETCH_TIMEOUT_MS,
  SOURCE_FRESH_MS,
  chgKey,
  srcKey,
  TTL_SECONDS,
  WARN_AFTER_MS,
  type SourceCache,
  type StoredSubscription,
} from "@/lib/server/subscription";

const KEEP_HISTORY_MS = 30 * 24 * 60 * 60 * 1000; // same window mergeFeedSync uses
const MAX_DESCRIPTION = 1000;
const MAX_CACHED_BYTES = 900_000; // stay below the Redis request size limit

/** Drops what the merge never uses, so the cache stays small. */
function slimEvents(events: IcalEventDTO[], now: number): IcalEventDTO[] {
  const slim = events
    .filter((e) => now - new Date(e.start).getTime() <= KEEP_HISTORY_MS)
    .map((e) => ({
      ...e,
      // Deadlines never use these (they are for the timetable import), so keep the cache small.
      end: undefined,
      location: undefined,
      description: e.description ? e.description.slice(0, MAX_DESCRIPTION) : undefined,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
  // Drop the oldest events while the entry is too big.
  while (slim.length > 0 && JSON.stringify(slim).length > MAX_CACHED_BYTES) {
    slim.splice(0, Math.ceil(slim.length / 10));
  }
  return slim;
}

/** Returns the feed's source cache, re-fetching when it is older than SOURCE_FRESH_MS. */
async function loadSource(
  kv: Kv,
  token: string,
  feed: IcalFeed,
  now: Date
): Promise<SourceCache | null> {
  const key = srcKey(token, feed.id);
  let cached: SourceCache | null = null;
  try {
    cached = await kv.get<SourceCache>(key);
  } catch {
    cached = null;
  }
  // A changed feed URL invalidates the cache.
  if (cached && cached.url !== feed.url) cached = null;
  if (cached && now.getTime() - new Date(cached.fetchedAt).getTime() < SOURCE_FRESH_MS) {
    return cached;
  }

  let next: SourceCache;
  try {
    const events = await fetchAndParseFeed(feed.url, FEED_FETCH_TIMEOUT_MS);
    next = { url: feed.url, events: slimEvents(events, now.getTime()), fetchedAt: now.toISOString() };
  } catch (err) {
    next = {
      url: feed.url,
      events: cached?.events ?? null,
      fetchedAt: now.toISOString(),
      error: err instanceof Error ? err.message : "A naptár nem érhető el",
      failingSince: cached?.failingSince ?? now.toISOString(),
    };
  }

  try {
    await kv.set(key, next, TTL_SECONDS);
  } catch {
    // The calendar can still be served; the next request will just refetch.
  }
  return next;
}

/** Renders the subscription's .ics: the snapshot, refreshed with the server-side source caches. */
export async function renderSubscription(
  kv: Kv,
  token: string,
  sub: StoredSubscription,
  now: Date,
  appUrl: string,
  viewParam?: string | null
): Promise<string> {
  const { courses, feeds, options, customPlatforms } = sub.snapshot;

  const sources = await Promise.allSettled(feeds.map((feed) => loadSource(kv, token, feed, now)));

  let deadlines: Deadline[] = sub.snapshot.deadlines;
  const warnings: HealthWarning[] = [];

  feeds.forEach((feed, i) => {
    const result = sources[i];
    const source = result.status === "fulfilled" ? result.value : null;
    if (!source) return;

    if (
      source.failingSince &&
      now.getTime() - new Date(source.failingSince).getTime() > WARN_AFTER_MS
    ) {
      warnings.push({ feedId: feed.id, feedName: feed.name });
    }

    // Without events the snapshot's deadlines for this feed stay as they are.
    if (!source.events) return;
    deadlines = mergeFeedSync({ feed, events: source.events, deadlines, courses, now }).deadlines;
  });

  // The "módosult" window starts when a change is first seen here, so it must outlive requests.
  let record: DueRecord | null = null;
  try {
    record = await kv.get<DueRecord>(chgKey(token));
  } catch {
    record = null;
  }
  const tracked = trackDueChanges(record, deadlines, now, sub.snapshot.deadlines);
  deadlines = tracked.deadlines;
  if (tracked.changed) {
    try {
      await kv.set(chgKey(token), tracked.record, TTL_SECONDS);
    } catch {
      // Rendering still works; the next request will try again.
    }
  }

  return buildCalendar({
    courses,
    deadlines,
    options,
    now,
    appUrl,
    warnings,
    view: parseView(viewParam, courses),
    // Dedup runs inside buildCalendar, i.e. after every mergeFeedSync above.
    feeds,
    customPlatforms: customPlatforms ?? [],
    ignoredDuplicatePairs: sub.snapshot.ignoredDuplicatePairs ?? [],
    classSessions: sub.snapshot.classSessions ?? [],
  });
}
