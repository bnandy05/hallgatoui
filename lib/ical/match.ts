import type { Course } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";

/**
 * Finds the course with the longest matchKeyword that appears
 * (case-insensitively) in the text; ties go to the first course in the array.
 * Longest-wins keeps a short keyword from shadowing a more specific one.
 * Returns null when nothing matches.
 */
export function matchCourseInText(text: string, courses: Course[]): string | null {
  const haystack = text.toLowerCase();

  let bestId: string | null = null;
  let bestLength = 0;
  for (const course of courses) {
    for (const keyword of course.matchKeywords) {
      const needle = keyword.trim().toLowerCase();
      if (needle.length > bestLength && haystack.includes(needle)) {
        bestId = course.id;
        bestLength = needle.length;
      }
    }
  }

  return bestId;
}

/**
 * Matches an event against the courses' keywords in its summary, description
 * or categories. Canvas summaries usually contain "[COURSE CODE]"; Moodle puts
 * the course name in categories.
 */
export function matchCourse(event: IcalEventDTO, courses: Course[]): string | null {
  return matchCourseInText(
    [event.summary, event.description ?? "", ...event.categories].join(" "),
    courses
  );
}
