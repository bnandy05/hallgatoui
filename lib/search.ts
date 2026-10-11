import { format } from "date-fns";
import { dateLocale, getMessages, type Locale } from "@/lib/i18n";
import { getPlatform, platformName } from "@/lib/platforms";
import { normalizeSearch } from "@/lib/text";
import type { Course, Deadline, IcalFeed, Platform } from "@/lib/types";

export type SearchKind = "page" | "action" | "course" | "link" | "deadline" | "resource";

export interface SearchItem {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  href?: string; // internal route or external URL
  external?: boolean;
  actionId?: "new-deadline" | "sync-feeds";
  color?: string; // course color dot
  platformId?: string; // for PlatformIcon (links, deadlines)
  due?: string; // ISO, deadlines only (tie-break)
}

export interface SearchInput {
  courses: Course[];
  deadlines: Deadline[];
  customPlatforms: Platform[];
  feeds: IcalFeed[];
  /** Language of the built-in titles; Hungarian when omitted. */
  locale?: Locale;
}

const KIND_WEIGHT: Record<SearchKind, number> = {
  course: 4,
  page: 3,
  link: 3,
  action: 2,
  deadline: 2,
  resource: 1,
};

/** The element id of a deadline's slip on a page, so a link can point at it (`#hatarido-<id>`). */
export function deadlineAnchorId(deadlineId: string): string {
  return `hatarido-${deadlineId}`;
}

export function buildSearchItems(input: SearchInput): SearchItem[] {
  const { courses, deadlines, customPlatforms, feeds, locale = "hu" } = input;
  const t = getMessages(locale);
  const dl = dateLocale(locale);
  const items: SearchItem[] = [
    { id: "page:/", kind: "page", title: t.search.week, subtitle: t.search.weekSub, href: "/" },
    { id: "page:/radar", kind: "page", title: t.search.deadlines, href: "/radar" },
    { id: "page:/beallitasok", kind: "page", title: t.search.settings, href: "/beallitasok" },
    { id: "action:new-deadline", kind: "action", title: t.search.newDeadline, actionId: "new-deadline" },
  ];
  if (feeds.length > 0) {
    items.push({
      id: "action:sync-feeds",
      kind: "action",
      title: t.search.syncFeeds,
      actionId: "sync-feeds",
    });
  }

  const courseById = new Map(courses.map((c) => [c.id, c]));

  for (const course of courses) {
    items.push({
      id: `course:${course.id}`,
      kind: "course",
      title: course.name,
      subtitle: [course.code, course.semester].filter(Boolean).join(" · ") || undefined,
      href: `/targy/${course.id}`,
      color: course.color,
    });

    for (const link of course.links) {
      const platform = getPlatform(link.platformId, customPlatforms);
      const platformLabel = platformName(platform, t.platforms.other);
      items.push({
        id: `link:${course.id}:${link.id}`,
        kind: "link",
        title: link.label || platformLabel,
        subtitle: link.label ? `${course.name} · ${platformLabel}` : course.name,
        href: link.url,
        external: true,
        platformId: link.platformId,
      });
    }

    for (const resource of course.resources) {
      items.push({
        id: `resource:${course.id}:${resource.id}`,
        kind: "resource",
        title: resource.title,
        subtitle: `${course.name} · ${t.resourceKinds[resource.kind]}`,
        href: resource.url,
        external: true,
        color: course.color,
      });
    }
  }

  for (const deadline of deadlines) {
    if (deadline.done) continue;
    const course = deadline.courseId ? courseById.get(deadline.courseId) : undefined;
    const due = format(new Date(deadline.due), t.formats.monthDayTime, { locale: dl });
    items.push({
      id: `deadline:${deadline.id}`,
      kind: "deadline",
      title: deadline.title,
      subtitle: course ? `${course.name} · ${due}` : due,
      href: deadline.url ?? `${course ? `/targy/${course.id}` : "/radar"}#${deadlineAnchorId(deadline.id)}`,
      external: Boolean(deadline.url),
      color: course?.color,
      platformId: deadline.platformId,
      due: deadline.due,
    });
  }

  return items;
}

function hasPrefixWord(words: string[], token: string): boolean {
  return words.some((w) => w.startsWith(token));
}

export function searchItems(items: SearchItem[], query: string, limit = 30): SearchItem[] {
  const q = normalizeSearch(query);
  if (!q) {
    return items.filter((i) => i.kind === "page" || i.kind === "action" || i.kind === "course").slice(0, limit);
  }
  const tokens = q.split(" ");

  const scored: { item: SearchItem; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const title = normalizeSearch(item.title);
    const haystack = normalizeSearch(`${item.title} ${item.subtitle ?? ""}`);
    if (!tokens.every((t) => haystack.includes(t))) return;

    const titleWords = title.split(" ");
    const allWords = haystack.split(" ");
    let score = KIND_WEIGHT[item.kind];
    for (const t of tokens) {
      if (hasPrefixWord(titleWords, t)) score += 3;
      if (hasPrefixWord(allWords, t)) score += 1;
    }
    scored.push({ item, score, index });
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.due && b.item.due) {
      const diff = new Date(a.item.due).getTime() - new Date(b.item.due).getTime();
      if (diff !== 0) return diff;
    }
    return a.index - b.index;
  });
  return scored.slice(0, limit).map((s) => s.item);
}
