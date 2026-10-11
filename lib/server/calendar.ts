import type { CalendarSnapshot, Deadline, IcalFeed } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { buildCalendar, type HealthWarning } from "@/lib/ical/export";
import { ICAL_MESSAGES_HU } from "@/lib/ical/errors";
import { getMessages, type Locale } from "@/lib/i18n";
import { fetchAndParseFeed } from "@/lib/ical/fetch";
import { parseView } from "@/lib/ical/views";
import { mergeFeedSync } from "@/lib/ical/sync";
import { userLocale } from "@/lib/server/locale";
import { calendarInput } from "@/lib/server/calendarInput";
import { trackDueChanges, type DueRecord } from "@/lib/server/dueChanges";
import type { AccountStore } from "@/lib/server/account/store";
import type { Kv } from "@/lib/server/kv";
import {
  FEED_FETCH_TIMEOUT_MS,
  ICS_TTL_SECONDS,
  SOURCE_FRESH_MS,
  chgKey,
  icsIndexKey,
  icsKey,
  srcKey,
  TTL_SECONDS,
  WARN_AFTER_MS,
  type SourceCache,
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
  userId: string,
  feed: IcalFeed,
  now: Date,
  untitled: string
): Promise<SourceCache | null> {
  const key = srcKey(userId, feed.id);
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
    const events = await fetchAndParseFeed(feed.url, FEED_FETCH_TIMEOUT_MS, untitled);
    next = { url: feed.url, events: slimEvents(events, now.getTime()), fetchedAt: now.toISOString() };
  } catch (err) {
    next = {
      url: feed.url,
      events: cached?.events ?? null,
      fetchedAt: now.toISOString(),
      error: err instanceof Error ? err.message : ICAL_MESSAGES_HU.unreachable,
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

/**
 * The account's deadlines refreshed with the server-side source caches, plus warnings for feeds
 * failing for more than a day. Also advances the due-change record. Used by the calendar and the
 * email digest.
 */
export async function loadLiveDeadlines(
  kv: Kv,
  userId: string,
  input: CalendarSnapshot,
  now: Date,
  locale: Locale = "hu"
): Promise<{ deadlines: Deadline[]; warnings: HealthWarning[] }> {
  const { courses, feeds } = input;

  const sources = await Promise.allSettled(feeds.map((feed) => loadSource(kv, userId, feed, now, getMessages(locale).labels.untitled)));

  let deadlines: Deadline[] = input.deadlines;
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
    record = await kv.get<DueRecord>(chgKey(userId));
  } catch {
    record = null;
  }
  const tracked = trackDueChanges(record, deadlines, now, input.deadlines);
  deadlines = tracked.deadlines;
  if (tracked.changed) {
    try {
      await kv.set(chgKey(userId), tracked.record, TTL_SECONDS);
    } catch {
      // Rendering still works; the next request will try again.
    }
  }
  return { deadlines, warnings };
}

/**
 * Renders a user's .ics for a view: the account's data refreshed with the server-side source
 * caches. A rendered view is cached for ICS_TTL_SECONDS and dropped by every data save (see
 * saveData). Returns null when the user has no data yet.
 */
export async function renderCalendar(
  store: AccountStore,
  userId: string,
  now: Date,
  appUrl: string,
  viewParam?: string | null
): Promise<string | null> {
  const kv = store.kv;
  // Keyed on the raw parameter so a cache hit never loads the data document (calendar apps poll
  // often); anything that isn't view-shaped shares the default entry.
  const raw = viewParam?.trim().toLowerCase() ?? "";
  // The subscribed calendar speaks the account's language (a calendar app has no preference of its own).
  const locale = userLocale(await store.getUser(userId));
  const key = icsKey(userId, locale, /^[a-z0-9-]{1,80}$/.test(raw) ? raw : "osszes");

  try {
    const cached = await kv.get<{ ics: string; renderedAt: string }>(key);
    if (cached && now.getTime() - new Date(cached.renderedAt).getTime() < ICS_TTL_SECONDS * 1000) {
      return cached.ics;
    }
  } catch {
    // Render fresh.
  }

  const doc = await store.getData(userId);
  if (!doc) return null;
  const input = calendarInput(doc);
  const view = parseView(viewParam, input.courses);

  const { courses, feeds, options, customPlatforms } = input;
  const { deadlines, warnings } = await loadLiveDeadlines(kv, userId, input, now, locale);
  const ics = buildCalendar({
    courses,
    deadlines,
    options,
    now,
    appUrl,
    warnings,
    view,
    // Dedup runs inside buildCalendar, i.e. after every mergeFeedSync above.
    feeds,
    customPlatforms,
    ignoredDuplicatePairs: input.ignoredDuplicatePairs,
    classSessions: input.classSessions,
    locale,
  });

  try {
    await kv.set(key, { ics, renderedAt: now.toISOString() }, ICS_TTL_SECONDS);
    await kv.sadd(icsIndexKey(userId), key);
  } catch {
    // Served uncached; the next request renders again.
  }
  return ics;
}
