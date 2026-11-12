// The Jev questions behind the suggestions (course for a name, duplicate or not). Pure; the
// server builds them from what the client sends, so the client never writes Jev's instructions.
// A question carries no ids, so the same question asked by any student hits the same cache entry.

import type { JevQuestion } from "@/lib/server/jev";

export const MAX_SUGGEST_ITEMS = 20;
export const MAX_SUGGEST_COURSES = 60;
export const MAX_SUGGEST_TEXT = 200;
export const NONE_OPTION = "none";

const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_SUGGEST_TEXT);

/** Which of the student's courses (`courses`, in the order sent) the subject `name` is; "none" if none. */
export function courseQuestion(id: string, name: string, courses: string[]): JevQuestion {
  return {
    id,
    quote: `Subject name from the university's calendar or timetable: "${clip(name)}"`,
    instructions:
      "Which of the student's courses is the same university subject as this name? Names may be in Hungarian or English, abbreviated, with a course code, or with a lecture/practice suffix (Ea, Gy, Lab). Numbers matter: 'Analysis I' is not 'Analysis II'. Choose 'none' if no course is clearly the same subject.",
    options: [
      ...courses.map((c, i) => ({ id: `c${i}`, criterion: `The course "${clip(c)}"` })),
      { id: NONE_OPTION, criterion: "None of these courses; it is a different subject or it is unclear." },
    ],
  };
}

export interface DuplicateSide {
  title: string;
  source: string; // "canvas", "moodle", "neptun", "manual"…
  time: string; // Budapest wall-clock "HH:mm", or "all day"
}

/** Whether two entries of one course on one day are the same item seen through two systems. */
export function duplicateQuestion(id: string, a: DuplicateSide, b: DuplicateSide): JevQuestion {
  const side = (label: string, s: DuplicateSide) => `${label}: "${clip(s.title)}" (from ${clip(s.source)}, ${clip(s.time)})`;
  return {
    id,
    quote: `Two calendar entries of the same university course, due on the same day.\n${side("A", a)}\n${side("B", b)}`,
    instructions:
      "Are A and B the same assignment, test or exam that reached the student through two systems (for example Canvas and Neptun), or two different items? Different numbers, different parts (theory/practice) or a retake versus the original mean different items.",
    options: [
      { id: "same", criterion: "The same item, listed twice." },
      { id: "different", criterion: "Two different items, or it is unclear." },
    ],
  };
}

/** Which grade component of the course (`components`, "label (kind)", in the order sent) a deadline belongs to. */
export function componentQuestion(id: string, title: string, components: string[]): JevQuestion {
  return {
    id,
    quote: `A deadline in the student's calendar for one university course: "${clip(title)}"`,
    instructions:
      "Which component of the course's grading is this deadline an instance of (an assignment submission, a quiz, a test or exam, a retake)? Numbers matter: 'ZH 2' belongs to a second test, not the first. Choose 'none' if it belongs to none of them (a consultation, a lecture, a deadline unrelated to grading) or it is unclear.",
    options: [
      ...components.map((c, i) => ({ id: `c${i}`, criterion: `The grade component "${clip(c)}"` })),
      { id: NONE_OPTION, criterion: "None of these components, or it is unclear." },
    ],
  };
}
