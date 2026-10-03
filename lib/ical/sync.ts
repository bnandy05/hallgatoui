import { newId } from "@/lib/id";
import type { Course, Deadline, DiscoveredContext, IcalFeed } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { parseCanvasEvent } from "@/lib/ical/canvas";
import { matchCourse } from "@/lib/ical/match";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NOTE_LENGTH = 500;

function noteFromDescription(description: string | undefined): string | undefined {
  const text = description?.trim();
  if (!text) return undefined;
  return text.length > MAX_NOTE_LENGTH ? `${text.slice(0, MAX_NOTE_LENGTH)}…` : text;
}

export interface FeedSyncInput {
  feed: IcalFeed;
  events: IcalEventDTO[];
  deadlines: Deadline[];
  courses: Course[];
  now: Date;
}

export interface FeedSyncResult {
  /** The complete deadline list after merging (other feeds' and manual deadlines untouched). */
  deadlines: Deadline[];
  /** Course contexts seen across all events of the feed (not only the 30-day window). */
  discovered: DiscoveredContext[];
}

/**
 * Pure merge of a freshly fetched feed into the existing deadlines. Upserts by
 * externalUid and keeps the user's done/critical/course choices. Shared by the store
 * (applyFeedSync) and the calendar subscription route.
 */
export function mergeFeedSync({
  feed,
  events,
  deadlines,
  courses,
  now: nowDate,
}: FeedSyncInput): FeedSyncResult {
  const feedId = feed.id;

  // Course contexts across all events, not only the 30-day window.
  const discoveredByKey = new Map<string, DiscoveredContext>();
  for (const event of events) {
    const context = parseCanvasEvent(event).context;
    if (!context) continue;
    const known = discoveredByKey.get(context.key);
    if (known) known.eventCount += 1;
    else discoveredByKey.set(context.key, { ...context, eventCount: 1 });
  }

  const now = nowDate.getTime();
  const markDoneBefore = feed.markDoneBefore ? new Date(feed.markDoneBefore).getTime() : NaN;
  const relevantEvents = events.filter(
    (e) => now - new Date(e.start).getTime() <= THIRTY_DAYS_MS
  );
  const incomingUids = new Set(relevantEvents.map((e) => e.uid));

  const existingByUid = new Map<string, Deadline>();
  for (const d of deadlines) {
    if (d.feedId === feedId && d.externalUid) {
      existingByUid.set(d.externalUid, d);
    }
  }

  // Keep every deadline that isn't part of this sync, plus this
  // feed's deadlines that are no longer present but whose due date
  // is already in the past (kept as history, never resurrected).
  const carried = deadlines.filter((d) => {
    if (d.feedId !== feedId) return true;
    const stillPresent = d.externalUid && incomingUids.has(d.externalUid);
    if (stillPresent) return false; // will be re-added below, updated
    const isFuture = new Date(d.due).getTime() >= now;
    return !isFuture; // drop future ones that vanished from the feed
  });

  const synced: Deadline[] = relevantEvents.map((event) => {
    const existing = existingByUid.get(event.uid);
    const info = parseCanvasEvent(event);

    let courseId: string | null;
    if (feed.courseId) {
      courseId = feed.courseId;
    } else {
      const autoMatch = matchCourse(event, courses);
      courseId = existing ? (existing.courseId ?? autoMatch) : autoMatch;
    }

    // Keep the raw summary while unassigned so the course stays visible.
    const title = courseId ? info.cleanTitle : event.summary;
    const url = info.assignmentUrl ?? event.url;
    const note = noteFromDescription(event.description);

    if (existing) {
      const dueChanged = new Date(existing.due).getTime() !== new Date(event.start).getTime();
      return {
        ...existing,
        title,
        due: event.start,
        url,
        note,
        courseId,
        ...(dueChanged && { previousDue: existing.due, dueChangedAt: nowDate.toISOString() }),
      };
    }

    return {
      id: newId(),
      courseId,
      title,
      due: event.start,
      url,
      note,
      platformId: feed.platformId,
      critical: false,
      // Deadlines that were already over when the feed was added start as done.
      done: new Date(event.start).getTime() < markDoneBefore,
      source: "ical",
      feedId,
      externalUid: event.uid,
    };
  });

  return { deadlines: [...carried, ...synced], discovered: [...discoveredByKey.values()] };
}
