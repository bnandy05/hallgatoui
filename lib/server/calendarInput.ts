import { visibleSessions } from "@/lib/ical/neptun";
import { DEFAULT_EXPORT_OPTIONS } from "@/lib/ical/export";
import type { DataDoc } from "@/lib/server/account/store";
import { MAX_CLASS_SESSIONS } from "@/lib/server/subscription";
import type { CalendarSnapshot } from "@/lib/types";

/**
 * What the calendar and the digest need from an account's data. Course links/resources/requirements and the
 * feeds' discovery state are left out; the timetable is limited to subjects the user didn't skip.
 */
export function calendarInput(doc: DataDoc): CalendarSnapshot {
  const { data, exportOptions } = doc;
  return {
    courses: data.courses.map((c) => ({ ...c, links: [], resources: [], requirements: undefined })),
    deadlines: data.deadlines,
    feeds: data.feeds.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      platformId: f.platformId,
      courseId: f.courseId,
      ignoredContexts: f.ignoredContexts,
      markDoneBefore: f.markDoneBefore,
    })),
    customPlatforms: data.customPlatforms,
    ignoredDuplicatePairs: data.ignoredDuplicatePairs,
    classSessions: visibleSessions(data.classSessions, data.timetableSources).slice(0, MAX_CLASS_SESSIONS),
    options: { ...DEFAULT_EXPORT_OPTIONS, ...exportOptions },
  };
}
