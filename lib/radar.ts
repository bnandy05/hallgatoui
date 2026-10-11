import {
  addDays,
  differenceInMilliseconds,
  endOfWeek,
  format,
  formatDistance,
  isBefore,
  startOfWeek,
} from "date-fns";
import { hu } from "date-fns/locale";
import type { Locale } from "date-fns";
import { dateLocale, getMessages, type Locale as AppLocale } from "@/lib/i18n";
import type { ClassSession, Deadline } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CRITICAL_THRESHOLD_MS = 48 * HOUR_MS;
const CHANGED_MARKER_MS = 48 * HOUR_MS;
const SOON_THRESHOLD_MS = 7 * DAY_MS;

export type Urgency = "overdue" | "critical" | "soon" | "later" | "done";

export function urgencyOf(d: Deadline, now: Date): Urgency {
  if (d.done) return "done";
  const due = new Date(d.due);
  if (isBefore(due, now)) return "overdue";
  const diff = differenceInMilliseconds(due, now);
  if (d.critical || diff <= CRITICAL_THRESHOLD_MS) return "critical";
  if (diff <= SOON_THRESHOLD_MS) return "soon";
  return "later";
}

/** True while a feed-reported due date change is younger than 48 hours. */
export function isRecentlyChanged(d: Deadline, now: Date): boolean {
  if (!d.dueChangedAt) return false;
  const age = now.getTime() - new Date(d.dueChangedAt).getTime();
  return Number.isFinite(age) && age <= CHANGED_MARKER_MS;
}

export function isCritical(d: Deadline, now: Date): boolean {
  const urgency = urgencyOf(d, now);
  return urgency === "overdue" || urgency === "critical";
}

export interface WeekGroup {
  weekStart: Date;
  label: string;
  items: Deadline[];
}

export function groupByWeek(deadlines: Deadline[], now: Date, locale: AppLocale = "hu"): WeekGroup[] {
  const t = getMessages(locale);
  const dl = dateLocale(locale);
  const nowWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const nextWeekStart = new Date(nowWeekStart.getTime() + 7 * DAY_MS);
  const prevWeekStart = new Date(nowWeekStart.getTime() - 7 * DAY_MS);

  const byWeek = new Map<number, Deadline[]>();
  for (const d of deadlines) {
    const weekStart = startOfWeek(new Date(d.due), { weekStartsOn: 1 });
    const key = weekStart.getTime();
    const existing = byWeek.get(key);
    if (existing) {
      existing.push(d);
    } else {
      byWeek.set(key, [d]);
    }
  }

  const groups: WeekGroup[] = Array.from(byWeek.entries()).map(([key, items]) => {
    const weekStart = new Date(key);
    const sortedItems = [...items].sort(
      (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()
    );

    let label: string;
    if (key === nowWeekStart.getTime()) {
      label = t.week.thisWeek;
    } else if (key === nextWeekStart.getTime()) {
      label = t.labels.nextWeek;
    } else if (key === prevWeekStart.getTime()) {
      label = t.labels.lastWeek;
    } else {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      label = `${format(weekStart, t.formats.monthDay, { locale: dl })} – ${format(weekEnd, t.formats.monthDay, { locale: dl })}`;
    }

    return { weekStart, label, items: sortedItems };
  });

  groups.sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  return groups;
}

export function weekSummary(
  deadlines: Deadline[],
  now: Date
): { total: number; critical: number } {
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const relevant = deadlines.filter(
    (d) => !d.done && !isBefore(weekEnd, new Date(d.due))
  );
  return {
    total: relevant.length,
    critical: relevant.filter((d) => isCritical(d, now)).length,
  };
}

export function nextDeadlineFor(
  courseId: string | null,
  deadlines: Deadline[],
  now: Date
): Deadline | undefined {
  return deadlines
    .filter((d) => d.courseId === courseId && !d.done && !isBefore(new Date(d.due), now))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0];
}

export function formatRelative(due: Date, now: Date, locale: Locale = hu): string {
  return formatDistance(due, now, { locale, addSuffix: true });
}

export interface DayBucket {
  date: Date;
  items: Deadline[];
}

export function weekStartOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Seven Monday-first buckets for the week starting at `weekStart`, items sorted by due time. */
export function bucketWeekByDay(deadlines: Deadline[], weekStart: Date): DayBucket[] {
  const days: DayBucket[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    items: [],
  }));
  const startMs = weekStart.getTime();
  const endMs = addDays(weekStart, 7).getTime();
  for (const d of deadlines) {
    const due = new Date(d.due);
    const ms = due.getTime();
    if (ms < startMs || ms >= endMs) continue;
    const index = days.findIndex((day, i) => i === 6 || ms < days[i + 1].date.getTime());
    days[index].items.push(d);
  }
  for (const day of days) {
    day.items.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  }
  return days;
}

export interface ClassDayBucket {
  date: Date;
  /** Classes and exams of the day, sorted by start. */
  sessions: ClassSession[];
  /** The holiday ("szunnap") of the day, if any. */
  holiday?: ClassSession;
}

/** Seven Monday-first buckets of class sessions (client local time, like bucketWeekByDay). */
export function bucketSessionsByDay(sessions: ClassSession[], weekStart: Date): ClassDayBucket[] {
  const days: ClassDayBucket[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    sessions: [],
  }));
  const startMs = weekStart.getTime();
  const endMs = addDays(weekStart, 7).getTime();
  for (const s of sessions) {
    const ms = new Date(s.start).getTime();
    if (ms < startMs || ms >= endMs) continue;
    const index = days.findIndex((_, i) => i === 6 || ms < days[i + 1].date.getTime());
    if (s.kind === "szunnap") days[index].holiday ??= s;
    else days[index].sessions.push(s);
  }
  for (const day of days) day.sessions.sort((a, b) => a.start.localeCompare(b.start));
  return days;
}

/** date-fns formats for the two ends of a week range, with the shorter forms used inside one month. */
export interface WeekRangeFormats {
  first: string;
  firstSameMonth: string;
  last: string;
  lastSameMonth: string;
}

const HU_WEEK_RANGE: WeekRangeFormats = { first: "MMM d.", firstSameMonth: "MMM d.", last: "MMM d.", lastSameMonth: "d." };

export function weekRangeLabel(weekStart: Date, locale: Locale = hu, formats: WeekRangeFormats = HU_WEEK_RANGE): string {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  return `${format(weekStart, sameMonth ? formats.firstSameMonth : formats.first, { locale })} – ${format(
    weekEnd,
    sameMonth ? formats.lastSameMonth : formats.last,
    { locale }
  )}`;
}
