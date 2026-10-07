import type { ClassSession, SemesterInfo } from "@/lib/types";
import { addDays, budapestDate, budapestInstant, mondayOf, type YMD } from "@/lib/ical/budapest";

// Teaching weeks: week 1 is the week of `SemesterInfo.start` (a Monday on the Budapest calendar).
// Holidays don't renumber weeks; a class on a holiday is simply missing from the timetable. Pure.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(text: string): YMD | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const ymd: YMD = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2]));
  return check.getUTCMonth() === ymd[1] - 1 && check.getUTCDate() === ymd[2] ? ymd : null;
}

export function formatYmd([y, m, d]: YMD): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A valid semester start, moved to the Monday of its week. */
export function normalizeSemesterStart(text: string): string | null {
  const ymd = parseYmd(text);
  return ymd ? formatYmd(mondayOf(ymd)) : null;
}

const utcDays = ([y, m, d]: YMD) => Date.UTC(y, m - 1, d) / DAY_MS;

/** The teaching week of an instant (1 = the start week; 0 or less before it). */
export function semesterWeek(semester: SemesterInfo, at: Date): number | null {
  const start = parseYmd(semester.start);
  if (!start) return null;
  const diff = utcDays(mondayOf(budapestDate(at))) - utcDays(mondayOf(start));
  return Math.floor(diff / 7) + 1;
}

/** Monday 00:00 to the next Monday 00:00 (Budapest) of a teaching week. */
export function weekBounds(semester: SemesterInfo, week: number): { from: Date; to: Date } | null {
  const start = parseYmd(semester.start);
  if (!start) return null;
  const monday = addDays(mondayOf(start), (week - 1) * 7);
  return { from: budapestInstant(monday, 0, 0), to: budapestInstant(addDays(monday, 7), 0, 0) };
}

/**
 * A guess for week 1: the Monday of the earliest class in the timetable. Right when the import
 * reaches back to the start of the term; the user confirms it either way.
 */
export function proposeSemesterStart(sessions: Pick<ClassSession, "kind" | "start">[]): string | null {
  let earliest: string | null = null;
  for (const s of sessions) if (s.kind === "ora" && (earliest === null || s.start < earliest)) earliest = s.start;
  return earliest ? formatYmd(mondayOf(budapestDate(new Date(earliest)))) : null;
}

/** A break longer than this between two classes separates two semesters. */
const SEMESTER_GAP_MS = 21 * DAY_MS;

/**
 * A guess for week 1 from a whole Neptun export (which may hold earlier semesters too): walking
 * back from the last class before `now`, the first class after which there is no three-week break.
 * Before a semester starts (the last class is long past), the first upcoming class.
 */
export function proposeSemesterStartAt(sessions: Pick<ClassSession, "kind" | "start">[], now: Date): string | null {
  const classes = sessions
    .filter((s) => s.kind === "ora")
    .map((s) => Date.parse(s.start))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (classes.length === 0) return null;
  const nowMs = now.getTime();
  let i = -1;
  for (let k = 0; k < classes.length && classes[k] <= nowMs; k++) i = k;
  const monday = (ms: number) => formatYmd(mondayOf(budapestDate(new Date(ms))));
  if (i === -1 || nowMs - classes[i] > SEMESTER_GAP_MS) {
    const upcoming = classes.find((ms) => ms > nowMs);
    return upcoming === undefined ? null : monday(upcoming);
  }
  while (i > 0 && classes[i] - classes[i - 1] < SEMESTER_GAP_MS) i--;
  return monday(classes[i]);
}
