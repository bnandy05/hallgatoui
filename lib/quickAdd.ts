import { addDays, addWeeks, startOfDay, startOfWeek } from "date-fns";
import { matchCourseInText } from "@/lib/ical/match";
import { normalizeSearch } from "@/lib/text";
import type { Course } from "@/lib/types";

export interface QuickDeadline {
  title: string; // remaining text, first letter upper-cased; "" if nothing left
  due?: Date; // undefined when no date/time token was found
  courseId?: string;
  critical: boolean;
  tokens: { date?: string; time?: string; course?: string; critical?: boolean };
}

interface Token {
  raw: string;
  n: string; // normalized, trailing ",;" removed (dots kept for numeric dates)
  c: string; // like n, but trailing dots removed too
  used: boolean;
}

// Words that are never used for fuzzy course matching.
const COMMON_WORDS = new Set([
  "zh", "hf", "beadando", "kviz", "vizsga", "pzh", "ea", "gy",
  "midterm", "exam", "quiz", "homework", "hw", "lab", "essay", "report", "assignment", "project",
]);

const WEEKDAYS: Record<string, number> = {
  hetfo: 1, hetfon: 1,
  kedd: 2, kedden: 2,
  szerda: 3, szerdan: 3,
  csutortok: 4, csutortokon: 4,
  pentek: 5, penteken: 5,
  szombat: 6, szombaton: 6,
  vasarnap: 0, vasarnapon: 0,
  // English
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 0, sun: 0,
};

const MONTHS: Record<string, number> = {
  jan: 1, januar: 1,
  feb: 2, febr: 2, februar: 2,
  marc: 3, marcius: 3,
  apr: 4, aprilis: 4,
  maj: 5, majus: 5,
  jun: 6, junius: 6,
  jul: 7, julius: 7,
  aug: 8, augusztus: 8,
  szept: 9, szeptember: 9,
  okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
  // English (the Hungarian forms above already cover jan, feb, apr, jun, jul, aug, nov, dec)
  january: 1, february: 2, mar: 3, march: 3, april: 4, may: 5, june: 6, july: 7,
  sep: 9, sept: 9, oct: 10, october: 10,
};

const NUMBER_WORDS: Record<string, number> = {
  egy: 1, ket: 2, harom: 3, negy: 4, ot: 5, hat: 6, nyolc: 8, kilenc: 9, tiz: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const n = normalizeSearch(raw).replace(/[,;]+$/, "");
      return { raw, n, c: n.replace(/\.+$/, ""), used: false };
    });
}

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
}

/** Month/day without a year: a date before today means next year. */
function resolveYearless(month: number, day: number, now: Date): Date | null {
  const today = startOfDay(now);
  const thisYear = validDate(now.getFullYear(), month, day);
  if (!thisYear) return null;
  return thisYear < today ? validDate(now.getFullYear() + 1, month, day) : thisYear;
}

interface DateMatch {
  date: Date;
  indices: number[];
}

function dateAt(tokens: Token[], i: number, now: Date): DateMatch | null {
  const t = tokens[i];
  const next = tokens[i + 1];
  const today = startOfDay(now);

  if (t.c === "ma") return { date: today, indices: [i] };
  if (t.c === "holnap") return { date: addDays(today, 1), indices: [i] };
  if (t.c === "holnaputan") return { date: addDays(today, 2), indices: [i] };
  // English: today / tomorrow / day after tomorrow
  if (t.c === "today") return { date: today, indices: [i] };
  if (t.c === "tomorrow" || t.c === "tmrw") return { date: addDays(today, 1), indices: [i] };
  if (t.c === "day" && next && !next.used && next.c === "after") {
    const third = tokens[i + 2];
    if (third && !third.used && (third.c === "tomorrow" || third.c === "tmrw")) {
      return { date: addDays(today, 2), indices: [i, i + 1, i + 2] };
    }
  }

  if (t.c in WEEKDAYS) {
    const weekday = WEEKDAYS[t.c];
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    let nextWeekIndices: number[] | null = null;
    if (prev && !prev.used && (prev.c === "jovo" || prev.c === "next")) nextWeekIndices = [i - 1];
    else if (
      prev && !prev.used && (prev.c === "heten" || prev.c === "week") &&
      prev2 && !prev2.used && (prev2.c === "jovo" || prev2.c === "next")
    ) {
      nextWeekIndices = [i - 2, i - 1];
    }
    if (nextWeekIndices) {
      const offset = (weekday + 6) % 7; // Monday = 0
      const monday = addWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1);
      return { date: addDays(monday, offset), indices: [...nextWeekIndices, i] };
    }
    const offset = (weekday - today.getDay() + 7) % 7 || 7;
    return { date: addDays(today, offset), indices: [i] };
  }

  // "N nap/het múlva"
  const amount = /^\d{1,3}$/.test(t.c) ? Number(t.c) : NUMBER_WORDS[t.c];
  if (amount && next && !next.used && (next.c === "nap" || next.c === "het")) {
    const after = tokens[i + 2];
    if (after && !after.used && after.c === "mulva") {
      const days = next.c === "nap" ? amount : amount * 7;
      return { date: addDays(today, days), indices: [i, i + 1, i + 2] };
    }
  }

  // English "in N days/weeks"
  if (t.c === "in" && next && !next.used) {
    const n = /^\d{1,3}$/.test(next.c) ? Number(next.c) : NUMBER_WORDS[next.c];
    const unit = tokens[i + 2];
    if (n && unit && !unit.used && /^(days?|weeks?)$/.test(unit.c)) {
      return { date: addDays(today, unit.c.startsWith("week") ? n * 7 : n), indices: [i, i + 1, i + 2] };
    }
  }

  // 2026.10.15. / 10.15. / 10.15 / 10/15
  const withYear = t.n.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})\.?$/);
  if (withYear) {
    const date = validDate(Number(withYear[1]), Number(withYear[2]), Number(withYear[3]));
    if (date) return { date, indices: [i] };
  }
  const yearless = t.n.match(/^(\d{1,2})[./](\d{1,2})\.?$/);
  if (yearless) {
    const date = resolveYearless(Number(yearless[1]), Number(yearless[2]), now);
    if (date) return { date, indices: [i] };
  }

  // English "15 oct" / "15th october"
  const ordinalDay = t.n.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
  if (ordinalDay && next && !next.used && next.c in MONTHS) {
    const date = resolveYearless(MONTHS[next.c], Number(ordinalDay[1]), now);
    if (date) return { date, indices: [i, i + 1] };
  }

  // okt 15 / október 15. / okt. 15-ig / oct 15th
  if (t.c in MONTHS && next && !next.used) {
    const day = next.n.match(/^(\d{1,2})(?:\.|-en|-ig|-ra|-re|-e|st|nd|rd|th)?$/);
    if (day) {
      const date = resolveYearless(MONTHS[t.c], Number(day[1]), now);
      if (date) return { date, indices: [i, i + 1] };
    }
  }

  return null;
}

interface TimeMatch {
  hours: number;
  minutes: number;
  indices: number[];
}

function timeAt(tokens: Token[], i: number): TimeMatch | null {
  const t = tokens[i];
  const clock = t.n.match(/^([01]?\d|2[0-3]):([0-5]\d)(?:-kor|-ig)?$/);
  if (clock) return { hours: Number(clock[1]), minutes: Number(clock[2]), indices: [i] };

  const hourSuffix = t.n.match(/^([01]?\d|2[0-3])(?:h|-kor|-ig)$/);
  if (hourSuffix) return { hours: Number(hourSuffix[1]), minutes: 0, indices: [i] };

  // English 12-hour clock: 10am, 3pm, 10:30pm
  const meridiem = t.n.match(/^(1[0-2]|0?[1-9])(?::([0-5]\d))?(am|pm)$/);
  if (meridiem) {
    const base = Number(meridiem[1]) % 12;
    return { hours: base + (meridiem[3] === "pm" ? 12 : 0), minutes: Number(meridiem[2] ?? 0), indices: [i] };
  }

  const bare = t.n.match(/^([01]?\d|2[0-3])$/);
  const next = tokens[i + 1];
  if (bare && next && !next.used && (next.c === "ora" || next.c === "orakor")) {
    return { hours: Number(bare[1]), minutes: 0, indices: [i, i + 1] };
  }
  return null;
}

function consume(tokens: Token[], indices: number[]): string {
  const fragment = indices.map((i) => tokens[i].raw).join(" ");
  for (const i of indices) tokens[i].used = true;
  return fragment;
}

function remaining(tokens: Token[]): Token[] {
  return tokens.filter((t) => !t.used);
}

/** Finds the (single or multi-word) keyword among unused tokens; null if not cleanly located. */
function locateKeyword(tokens: Token[], keyword: string): number[] | null {
  const words = keyword.split(" ");
  for (let i = 0; i + words.length <= tokens.length; i++) {
    const slice = tokens.slice(i, i + words.length);
    if (slice.every((t, k) => !t.used && t.c === words[k])) {
      return slice.map((_, k) => i + k);
    }
  }
  return null;
}

function matchCourseByKeyword(tokens: Token[], courses: Course[]) {
  const text = normalizeSearch(remaining(tokens).map((t) => t.c).join(" "));
  const normalizedCourses = courses.map((c) => ({
    ...c,
    matchKeywords: c.matchKeywords.map(normalizeSearch),
  }));
  const courseId = matchCourseInText(text, normalizedCourses);
  if (!courseId) return null;

  // The longest keyword of that course that occurs in the text.
  const keywords = normalizedCourses
    .find((c) => c.id === courseId)!
    .matchKeywords.filter((k) => k && text.includes(k))
    .sort((a, b) => b.length - a.length);
  const indices = keywords.length > 0 ? locateKeyword(tokens, keywords[0]) : null;
  return { courseId, indices };
}

function matchCourseByWord(tokens: Token[], courses: Course[]) {
  const courseWords = courses.map((course) => ({
    id: course.id,
    words: normalizeSearch(`${course.name} ${course.code ?? ""}`).split(" "),
  }));
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.used || t.c.length < 3 || COMMON_WORDS.has(t.c)) continue;
    const matches = courseWords.filter((c) => c.words.some((w) => w.startsWith(t.c)));
    if (matches.length === 1) return { courseId: matches[0].id, index: i };
  }
  return null;
}

/**
 * Parses free text like "ZH jövő kedd 10:00 analízis !" into a deadline draft.
 * Pure and conservative: anything ambiguous is left unset.
 */
export function parseQuickDeadline(text: string, courses: Course[], now: Date): QuickDeadline {
  const tokens = tokenize(text);
  const result: QuickDeadline = { title: "", critical: false, tokens: {} };

  // Critical: "!", "!!", "kritikus"/"critical", or a trailing "!" on another word.
  const criticalFragments: string[] = [];
  for (const t of tokens) {
    if (/^!+$/.test(t.n) || t.n === "kritikus" || t.n === "critical") {
      criticalFragments.push(t.raw);
      t.used = true;
    } else if (/!+$/.test(t.n)) {
      criticalFragments.push("!");
      t.raw = t.raw.replace(/!+(?=[,;]*$)/, "");
      t.n = t.n.replace(/!+$/, "");
      t.c = t.c.replace(/!+$/, "");
    }
  }
  if (criticalFragments.length > 0) {
    result.critical = true;
    result.tokens.critical = true;
  }

  // Date: the earliest token position that forms a date wins.
  let date: Date | null = null;
  for (let i = 0; i < tokens.length && !date; i++) {
    if (tokens[i].used) continue;
    const match = dateAt(tokens, i, now);
    if (match && match.indices.every((k) => !tokens[k].used)) {
      date = match.date;
      result.tokens.date = consume(tokens, match.indices);
    }
  }

  // Time
  let time: TimeMatch | null = null;
  for (let i = 0; i < tokens.length && !time; i++) {
    if (tokens[i].used) continue;
    const match = timeAt(tokens, i);
    if (match) {
      time = match;
      // English "at 10:00": the word belongs to the time.
      const before = tokens[match.indices[0] - 1];
      if (before && !before.used && before.c === "at") match.indices.unshift(match.indices[0] - 1);
      result.tokens.time = consume(tokens, match.indices);
    }
  }

  if (date || time) {
    const hours = time?.hours ?? 23;
    const minutes = time?.minutes ?? 59;
    let due: Date;
    if (date) {
      due = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
    } else {
      due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      if (due <= now) due = addDays(due, 1);
    }
    result.due = due;
  }

  // Course: keyword match first, then a unique word-prefix match (last word preferred).
  const byKeyword = matchCourseByKeyword(tokens, courses);
  if (byKeyword) {
    result.courseId = byKeyword.courseId;
    if (byKeyword.indices) result.tokens.course = consume(tokens, byKeyword.indices);
  } else {
    const byWord = matchCourseByWord(tokens, courses);
    if (byWord) {
      result.courseId = byWord.courseId;
      result.tokens.course = consume(tokens, [byWord.index]);
    }
  }

  const title = remaining(tokens).map((t) => t.raw).join(" ").replace(/\s+/g, " ").trim();
  result.title = title.charAt(0).toUpperCase() + title.slice(1);
  return result;
}
