import type { Course, Deadline } from "@/lib/types";
import { normalizeSearch } from "@/lib/text";

// Filtered views of the same calendar, selected with `?nezet=` on the subscription URL.

export type CalendarView =
  | { kind: "all" }
  | { kind: "critical" }
  | { kind: "exams" }
  | { kind: "timetable" }
  | { kind: "course"; courseId: string };

export const ALL_VIEW: CalendarView = { kind: "all" };

const COURSE_PREFIX = "targy-";

/** Matched as substrings of the accent-stripped, lowercase title. */
const EXAM_SUBSTRINGS = ["zarthelyi", "vizsga", "exam", "teszt", "quiz", "kviz", "kollokvium", "midterm"];
// "zh" only as a separate token, so "zh2" and "ZH." match but "Szhoz" does not.
const ZH_PATTERN = /(?<![a-z])zh(?![a-z])/;

/** Whether the title looks like a test or an exam. */
export function isExamTitle(title: string): boolean {
  const text = normalizeSearch(title);
  return ZH_PATTERN.test(text) || EXAM_SUBSTRINGS.some((keyword) => text.includes(keyword));
}

/**
 * Parses the `nezet` query value. Unknown values, and courses missing from `courses` when it
 * is given, fall back to the full calendar.
 */
export function parseView(param: string | null | undefined, courses?: Course[]): CalendarView {
  if (param === "kritikus") return { kind: "critical" };
  if (param === "zh") return { kind: "exams" };
  if (param === "orarend") return { kind: "timetable" };
  if (param?.startsWith(COURSE_PREFIX)) {
    const courseId = param.slice(COURSE_PREFIX.length);
    if (courseId && (!courses || courses.some((c) => c.id === courseId))) {
      return { kind: "course", courseId };
    }
  }
  return ALL_VIEW;
}

/** Inverse of parseView, for building URLs and UIDs. */
export function viewParam(view: CalendarView): string {
  switch (view.kind) {
    case "critical":
      return "kritikus";
    case "exams":
      return "zh";
    case "timetable":
      return "orarend";
    case "course":
      return `${COURSE_PREFIX}${view.courseId}`;
    default:
      return "osszes";
  }
}

export function filterDeadlinesForView(deadlines: Deadline[], view: CalendarView): Deadline[] {
  switch (view.kind) {
    case "critical":
      return deadlines.filter((d) => d.critical === true);
    case "exams":
      return deadlines.filter((d) => isExamTitle(d.title));
    case "course":
      return deadlines.filter((d) => d.courseId === view.courseId);
    case "timetable":
      return [];
    default:
      return deadlines;
  }
}

/** X-WR-CALNAME of the view. */
export function viewCalendarName(view: CalendarView, courses: Course[]): string {
  const base = "Hallgatói réteg";
  switch (view.kind) {
    case "critical":
      return `${base} – Kritikus`;
    case "exams":
      return `${base} – ZH-k és vizsgák`;
    case "timetable":
      return `${base} – Órarend`;
    case "course": {
      const course = courses.find((c) => c.id === view.courseId);
      return course ? `${base} – ${course.name}` : base;
    }
    default:
      return base;
  }
}
