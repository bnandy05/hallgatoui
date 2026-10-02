import type { AppData, Course, Deadline, IcalFeed } from "@/lib/types";
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
  });
}
