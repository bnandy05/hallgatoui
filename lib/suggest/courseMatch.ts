import type { Course } from "@/lib/types";
import { matchCourseInText } from "@/lib/ical/match";
import { normalizeSearch } from "@/lib/text";

// Which existing course a name from outside the app (a Neptun subject, a Canvas course) belongs
// to. Pure. The local tiers settle everything they can: an equal name (accents, punctuation and
// an Ea/Gy/Lab suffix ignored), a keyword or course code, or one clearly closest name. Only what
// is left is worth asking Jev (`ask`), e.g. an English Neptun name against Hungarian courses.
// Different numbers ("Analízis I" and "Analízis II") are never the same course.

export type CourseGuess =
  | { courseId: string; via: "exact" | "keyword" | "similar" }
  | { ask: true }
  | null;

const SIMILAR_MIN = 0.75;
const SIMILAR_MARGIN = 0.25;

const KIND_WORDS = new Set([
  "ea",
  "gy",
  "lab",
  "eloadas",
  "gyakorlat",
  "labor",
  "szeminarium",
  "lecture",
  "practice",
  "practical",
  "seminar",
]);
const STOP_WORDS = new Set(["a", "az", "es", "and", "of", "the", "in", "to", "for"]);
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };

interface NameTokens {
  words: Set<string>;
  numbers: Set<string>;
}

export function nameTokens(name: string): NameTokens {
  const words = new Set<string>();
  const numbers = new Set<string>();
  const text = normalizeSearch(name)
    .replace(/\(?\d{4}\s*[/-]\s*\d{2,4}(\s*[/-]\s*[12])?\)?/g, " ") // a semester
    .replace(/\[[^\]]*\]/g, " ");
  for (const t of text.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (KIND_WORDS.has(t) || STOP_WORDS.has(t)) continue;
    if (/^\d+$/.test(t)) numbers.add(String(Number(t)));
    else if (ROMAN[t]) numbers.add(ROMAN[t]);
    else words.add(t);
  }
  return { words, numbers };
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** 0..1: shared words over the larger name; 0 when both carry numbers and they differ. */
export function nameSimilarity(a: NameTokens, b: NameTokens): number {
  if (a.numbers.size && b.numbers.size && !sameSet(a.numbers, b.numbers)) return 0;
  if (!a.words.size || !b.words.size) return 0;
  let shared = 0;
  for (const w of a.words) if (b.words.has(w)) shared += 1;
  const score = shared / Math.max(a.words.size, b.words.size);
  // "Analízis" against "Analízis I": likely, but not certain.
  return a.numbers.size !== b.numbers.size ? score * 0.9 : score;
}

export function guessCourse(name: string, courses: Course[]): CourseGuess {
  if (courses.length === 0 || !name.trim()) return null;
  const target = nameTokens(name);
  const scored = courses.map((c) => {
    const t = nameTokens(c.name);
    const exact = target.words.size > 0 && sameSet(target.words, t.words) && sameSet(target.numbers, t.numbers);
    return { course: c, exact, score: nameSimilarity(target, t) };
  });
  const exact = scored.filter((s) => s.exact);
  if (exact.length === 1) return { courseId: exact[0].course.id, via: "exact" };

  const keyword = matchCourseInText(name, courses);
  if (keyword) return { courseId: keyword, via: "keyword" };
  const byCode = courses.find((c) =>
    (c.code ?? "")
      .split(/[,;]/)
      .map((code) => normalizeSearch(code))
      .some((code) => code.length >= 4 && normalizeSearch(name).includes(code))
  );
  if (byCode) return { courseId: byCode.id, via: "keyword" };

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (exact.length === 0 && best.score >= SIMILAR_MIN && (!second || best.score - second.score >= SIMILAR_MARGIN)) {
    return { courseId: best.course.id, via: "similar" };
  }
  return { ask: true };
}

/** Course names as the question offers them: a stable order, so the same question hits the cache. */
export function questionCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => a.name.localeCompare(b.name, "hu") || a.id.localeCompare(b.id));
}
