import type { AppData, Course, Deadline, IcalFeed } from "@/lib/types";

export function makeCourse(id: string, name: string, matchKeywords: string[] = []): Course {
  return { id, name, color: "#000000", links: [], resources: [], matchKeywords, createdAt: "2026-09-01T00:00:00.000Z" };
}

export function makeFeed(overrides: Partial<IcalFeed> = {}): IcalFeed {
  return { id: "feed-1", name: "Canvas", url: "https://example.com/feed.ics", platformId: "canvas", courseId: null, ...overrides };
}

export function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return { id: "d1", courseId: null, title: "Beadandó", due: "2026-10-10T21:59:00.000Z", critical: false, done: false, source: "manual", ...overrides };
}

export function emptyAppData(): AppData {
  return { version: 1, courses: [], deadlines: [], customPlatforms: [], feeds: [], ignoredDuplicatePairs: [], classSessions: [], timetableSources: [], requirementRules: [], requirementResults: [] };
}
