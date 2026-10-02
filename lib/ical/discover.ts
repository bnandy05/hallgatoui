import type { Course, DiscoveredContext, IcalFeed } from "@/lib/types";
import { formatKindLabel, normalizeCourseName } from "@/lib/ical/canvas";
import { matchCourseInText } from "@/lib/ical/match";

export { formatKindLabel };

export interface PendingContext {
  feedId: string;
  context: DiscoveredContext;
}

export interface DiscoveryGroup {
  id: string; // groupKey, or the context key after a split
  baseName: string;
  semester?: string;
  items: PendingContext[]; // sorted Ea, Gy, Lab, then none
}

export type DiscoveryDecision =
  | { kind: "new"; name: string; items: PendingContext[] }
  | { kind: "existing"; courseId: string; items: PendingContext[] }
  | { kind: "skip"; items: PendingContext[] };

const KIND_ORDER = ["Ea", "Gy", "Lab"];

function kindRank(context: DiscoveredContext): number {
  return context.kind ? KIND_ORDER.indexOf(context.kind) : KIND_ORDER.length;
}

/** Keywords a course gets for a context: its code, or the label when it has none. */
export function keywordForContext(context: DiscoveredContext): string {
  return context.code ?? context.label;
}

/**
 * Discovered contexts the user hasn't handled yet: not ignored, not already
 * caught by a course keyword, from feeds without a fixed course. Deduped by
 * context key (first feed wins).
 */
export function pendingContexts(feeds: IcalFeed[], courses: Course[]): PendingContext[] {
  const seen = new Set<string>();
  const pending: PendingContext[] = [];
  for (const feed of feeds) {
    if (feed.courseId !== null) continue;
    const ignored = new Set(feed.ignoredContexts ?? []);
    for (const context of feed.discovered ?? []) {
      if (ignored.has(context.key) || seen.has(context.key)) continue;
      if (matchCourseInText(context.label, courses) !== null) continue;
      seen.add(context.key);
      pending.push({ feedId: feed.id, context });
    }
  }
  return pending;
}

export function groupContexts(pending: PendingContext[]): DiscoveryGroup[] {
  const byKey = new Map<string, DiscoveryGroup>();
  for (const item of pending) {
    const key = item.context.groupKey;
    const group = byKey.get(key);
    if (group) {
      group.items.push(item);
    } else {
      byKey.set(key, {
        id: key,
        baseName: item.context.baseName,
        semester: item.context.semester,
        items: [item],
      });
    }
  }
  const groups = [...byKey.values()];
  for (const group of groups) {
    group.items.sort((a, b) => kindRank(a.context) - kindRank(b.context));
  }
  return groups.sort((a, b) => a.baseName.localeCompare(b.baseName, "hu"));
}

/** One group per item, named after the item (used by "Szétbontás"). */
export function splitGroup(group: DiscoveryGroup): DiscoveryGroup[] {
  return group.items.map((item) => ({
    id: item.context.key,
    baseName: item.context.name,
    semester: item.context.semester,
    items: [item],
  }));
}

export function findExistingCourse(group: DiscoveryGroup, courses: Course[]): string | null {
  const key = normalizeCourseName(group.baseName);
  return courses.find((c) => normalizeCourseName(c.name) === key)?.id ?? null;
}
