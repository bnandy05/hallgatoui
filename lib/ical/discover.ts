import type { Course, CourseLink, DiscoveredContext, IcalFeed } from "@/lib/types";
import { formatKindLabel, normalizeCourseName } from "@/lib/ical/canvas";
import { matchCourseInText } from "@/lib/ical/match";
import { newId } from "@/lib/id";
import { normalizeLinkUrl } from "@/lib/url";

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

/**
 * Adds the Canvas course link of every context the feed already assigns to a course (the
 * feed's fixed course, or a keyword match), so courses that never went through the discovery
 * dialog (Neptun mapping, made by hand) get their link too. Each context is linked once:
 * `linked` lists the keys to remember in `feed.linkedContexts`, so a deleted link stays deleted.
 * Skipped contexts are left alone. Returns the same `courses` array when nothing changed.
 */
export function autoLinkContexts(courses: Course[], feed: IcalFeed): { courses: Course[]; linked: string[] } {
  const skip = new Set([...(feed.ignoredContexts ?? []), ...(feed.linkedContexts ?? [])]);
  const added = new Map<string, { url: string; context: DiscoveredContext }[]>();
  const linked: string[] = [];

  for (const context of feed.discovered ?? []) {
    if (skip.has(context.key) || !context.courseUrl) continue;
    const url = normalizeLinkUrl(context.courseUrl);
    const courseId = feed.courseId ?? matchCourseInText(context.label, courses);
    const course = courseId ? courses.find((c) => c.id === courseId) : undefined;
    if (!url || !course) continue;
    linked.push(context.key);
    const pending = added.get(course.id) ?? [];
    if (course.links.some((l) => l.url === url) || pending.some((p) => p.url === url)) continue;
    added.set(course.id, [...pending, { url, context }]);
  }
  if (added.size === 0) return { courses, linked };

  return {
    courses: courses.map((course) => {
      const pending = added.get(course.id);
      if (!pending) return course;
      const canvasCount = course.links.filter((l) => l.platformId === "canvas").length + pending.length;
      const links: CourseLink[] = pending.map(({ url, context }) => ({
        id: newId(),
        platformId: "canvas",
        url,
        label: canvasCount > 1 && context.kind ? formatKindLabel(context.kind) : undefined,
      }));
      return { ...course, links: [...course.links, ...links] };
    }),
    linked,
  };
}
