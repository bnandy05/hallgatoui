import type { AppData, ClassSession, Course, Deadline, IcalFeed, TimetableSource } from "@/lib/types";
import { normalizeLinkUrl } from "@/lib/url";

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Re-validates every user-visible URL so a crafted backup can't inject unsafe hrefs. */
function sanitizeUrls(data: AppData): AppData {
  const courses = data.courses.map((c) => ({
    ...c,
    links: c.links.flatMap((l) => {
      const url = normalizeLinkUrl(String(l.url ?? ""));
      return url ? [{ ...l, url }] : [];
    }),
    resources: c.resources.flatMap((r) => {
      const url = normalizeLinkUrl(String(r.url ?? ""));
      return url ? [{ ...r, url }] : [];
    }),
  }));
  const deadlines = data.deadlines.map((d) => ({
    ...d,
    url: d.url ? (normalizeLinkUrl(d.url) ?? undefined) : undefined,
  }));
  const feeds = data.feeds
    .filter((f: IcalFeed) => isHttpUrl(f.url))
    .map((f: IcalFeed) =>
      Array.isArray(f.discovered)
        ? {
            ...f,
            discovered: f.discovered.map((c) =>
              c.courseUrl && !isHttpUrl(c.courseUrl) ? { ...c, courseUrl: undefined } : c
            ),
          }
        : f
    );
  return { ...data, courses, deadlines, feeds };
}

function isCourseShaped(value: unknown): value is Course {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    Array.isArray(c.links) &&
    Array.isArray(c.resources) &&
    Array.isArray(c.matchKeywords)
  );
}

function isDeadlineShaped(value: unknown): value is Deadline {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.title === "string" &&
    typeof d.due === "string" &&
    typeof d.done === "boolean" &&
    typeof d.critical === "boolean" &&
    (d.source === "manual" || d.source === "ical")
  );
}

const SESSION_KINDS = ["ora", "vizsga", "szunnap", "egyeb"];

/** Drops malformed timetable entries instead of failing the whole import. */
function sessionsFrom(value: unknown): ClassSession[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is ClassSession => {
    if (!s || typeof s !== "object") return false;
    const o = s as Record<string, unknown>;
    return (
      typeof o.id === "string" &&
      typeof o.sourceId === "string" &&
      typeof o.externalUid === "string" &&
      typeof o.subject === "string" &&
      typeof o.subjectKey === "string" &&
      typeof o.start === "string" &&
      typeof o.end === "string" &&
      SESSION_KINDS.includes(o.kind as string) &&
      Array.isArray(o.teachers) &&
      (o.courseId === null || typeof o.courseId === "string")
    );
  });
}

function sourcesFrom(value: unknown): TimetableSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is TimetableSource => {
    if (!s || typeof s !== "object") return false;
    const o = s as Record<string, unknown>;
    return (
      typeof o.id === "string" &&
      typeof o.name === "string" &&
      typeof o.importedAt === "string" &&
      !!o.subjectCourses &&
      typeof o.subjectCourses === "object"
    );
  });
}

const MAX_TOMBSTONES = 5000;

/** Keeps the string-to-string entries of a tombstone map (newest first, capped). */
function tombstonesFrom(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === "string" && e[0].length <= 200
  );
  entries.sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0));
  return Object.fromEntries(entries.slice(0, MAX_TOMBSTONES));
}

/**
 * Validates an arbitrary JSON value as an AppData export and returns it
 * typed. Throws an Error with a Hungarian message when the shape doesn't
 * match, so callers can show it directly to the user.
 */
export function parseAppData(json: unknown): AppData {
  if (!json || typeof json !== "object") {
    throw new Error("Nem érvényes mentésfájl");
  }

  const data = json as Record<string, unknown>;

  if (data.version !== 1) {
    throw new Error("Nem támogatott verzió");
  }

  if (
    !Array.isArray(data.courses) ||
    !Array.isArray(data.deadlines) ||
    !Array.isArray(data.customPlatforms) ||
    !Array.isArray(data.feeds)
  ) {
    throw new Error("Nem érvényes mentésfájl");
  }

  if (!data.courses.every(isCourseShaped)) {
    throw new Error("Nem érvényes mentésfájl");
  }

  if (!data.deadlines.every(isDeadlineShaped)) {
    throw new Error("Nem érvényes mentésfájl");
  }

  return sanitizeUrls({
    version: 1,
    courses: data.courses,
    deadlines: data.deadlines,
    customPlatforms: data.customPlatforms as AppData["customPlatforms"],
    feeds: data.feeds as AppData["feeds"],
    classSessions: sessionsFrom(data.classSessions),
    timetableSources: sourcesFrom(data.timetableSources),
    tombstones: tombstonesFrom(data.tombstones),
    ignoredDuplicatePairs: Array.isArray(data.ignoredDuplicatePairs)
      ? data.ignoredDuplicatePairs
          .filter((p): p is string => typeof p === "string" && p.length <= 600)
          .slice(0, 2000)
      : [],
  });
}
