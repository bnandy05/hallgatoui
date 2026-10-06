import type { Course } from "@/lib/types";
import { guessCourse, questionCourses } from "@/lib/suggest/courseMatch";
import { MAX_SUGGEST_COURSES, MAX_SUGGEST_ITEMS, type DuplicateSide } from "@/lib/suggest/questions";

// Browser side of /api/javaslat. Every failure (no key on the server, offline, rate limit) just
// means no suggestion: the dialogs keep their own default and the duplicate stays separate.

async function post<T>(body: unknown): Promise<T | null> {
  try {
    const res = await fetch("/api/javaslat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface CourseSuggestion {
  courseId: string | null; // null: Jev is sure it is none of them
  via: "exact" | "keyword" | "similar" | "jev";
  confidence?: number;
}

/** The suggestions the local tiers settle, and the names left for Jev. */
export function localCourseSuggestions(names: string[], courses: Course[]) {
  const found = new Map<string, CourseSuggestion>();
  const ask: string[] = [];
  for (const name of names) {
    const guess = guessCourse(name, courses);
    if (guess && "courseId" in guess) found.set(name, { courseId: guess.courseId, via: guess.via });
    else if (guess) ask.push(name);
  }
  return { found, ask };
}

/** Jev's suggestions for names the local tiers left open (one request per 20 names). */
export async function askCourses(names: string[], courses: Course[]): Promise<Map<string, CourseSuggestion>> {
  const out = new Map<string, CourseSuggestion>();
  const offered = questionCourses(courses).slice(0, MAX_SUGGEST_COURSES);
  for (let i = 0; i < names.length; i += MAX_SUGGEST_ITEMS) {
    const chunk = names.slice(i, i + MAX_SUGGEST_ITEMS);
    const res = await post<{ answers: ({ course: number | null; confidence: number } | null)[] }>({
      kind: "course",
      names: chunk,
      courses: offered.map((c) => c.name),
    });
    res?.answers.forEach((a, k) => {
      if (!a) return;
      const course = a.course === null ? null : offered[a.course];
      if (a.course !== null && !course) return;
      out.set(chunk[k], { courseId: course?.id ?? null, via: "jev", confidence: a.confidence });
    });
  }
  return out;
}

/** Jev's component (index into `components`) per title, same order; null when none or unsure. */
export async function askComponents(titles: string[], components: string[]): Promise<(number | null)[] | null> {
  const res = await post<{ answers: ({ component: number | null; confidence: number } | null)[] }>({
    kind: "component",
    titles: titles.slice(0, MAX_SUGGEST_ITEMS),
    components: components.slice(0, MAX_SUGGEST_COURSES),
  });
  if (!res) return null;
  return titles.map((_, i) => (i < MAX_SUGGEST_ITEMS ? (res.answers[i]?.component ?? null) : null));
}

/**
 * Jev's verdict per pair (same order): true/false, or null where it has no confident answer.
 * Null overall when the request failed (offline, no key, limit), so the pairs are asked later.
 */
export async function judgeDuplicates(pairs: { a: DuplicateSide; b: DuplicateSide }[]): Promise<(boolean | null)[] | null> {
  const res = await post<{ answers: ({ same: boolean } | null)[]; limited?: boolean }>({ kind: "duplicate", pairs });
  if (!res || res.limited) return null;
  return pairs.map((_, i) => res.answers[i]?.same ?? null);
}
