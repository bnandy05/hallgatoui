import type { Course } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";

/**
 * Finds the first course whose matchKeywords appear (case-insensitively) in
 * the event's summary, description or categories. Canvas summaries usually
 * contain "[COURSE CODE]"; Moodle puts the course name in categories.
 * Returns null when nothing matches.
 */
export function matchCourse(event: IcalEventDTO, courses: Course[]): string | null {
  const haystack = [event.summary, event.description ?? "", ...event.categories]
    .join(" ")
    .toLowerCase();

  for (const course of courses) {
    for (const keyword of course.matchKeywords) {
      const needle = keyword.trim().toLowerCase();
      if (needle && haystack.includes(needle)) {
        return course.id;
      }
    }
  }

  return null;
}
