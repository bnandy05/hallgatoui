import type { ClassSession, Course, Deadline, IcalFeed } from "@/lib/types";
import type { CatchUpGroup } from "@/lib/catchup";
import { instanceLabel } from "@/lib/rules/instances";
import { applyDedupe } from "@/lib/ical/dedupe";
import { isCritical, isRecentlyChanged } from "@/lib/radar";
import {
  addDays,
  budapestDate,
  budapestInstant,
  dateKey,
  mondayOf,
  type YMD,
} from "@/lib/ical/budapest";

// Pure content of the email digest (napi / heti / havi): what goes in. The mails are rendered in
// lib/digestEmail.ts; scheduling and sending live in lib/server/digest.ts.

export type DigestFrequency = "napi" | "heti" | "havi";

export const DIGEST_FREQUENCIES: { id: DigestFrequency; label: string }[] = [
  { id: "napi", label: "Napi" },
  { id: "heti", label: "Heti (hétfő)" },
  { id: "havi", label: "Havi (1-jén)" },
];

/** What the browser sees about its own digest. */
export interface DigestStatus {
  frequency: DigestFrequency;
  lastSentAt?: string;
}

export function isDigestFrequency(value: unknown): value is DigestFrequency {
  return value === "napi" || value === "heti" || value === "havi";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERDUE_LOOKBACK_MS = 14 * DAY_MS;

/**
 * The Budapest period an instant falls in: one digest is sent per period. A weekly digest's
 * period starts on Monday, a monthly one's on the 1st.
 */
export function digestPeriodKey(frequency: DigestFrequency, now: Date): string {
  const today = budapestDate(now);
  if (frequency === "napi") return `d:${dateKey(today)}`;
  if (frequency === "heti") return `w:${dateKey(mondayOf(today))}`;
  return `m:${dateKey(today).slice(0, 6)}`;
}

/** Light shape check; the confirmation email is the real test. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email) ? email : null;
}

export interface DigestItem {
  deadline: Deadline;
  course?: Course;
  critical: boolean;
  changed: boolean;
}

/** One "Rögzítésre vár" line: a class, deadline or exam that ended without a result. */
export interface DigestPending {
  title: string; // "Programozáselmélet gyakorlat"
  detail: string; // "okt. 1. (Cs) 08:00 · 4. hét: jelenlét, röpzh"
  end: string; // ISO
}

/** The catch-up groups as digest lines, newest first (the mail lists the first few). */
export function digestPendingFrom(groups: CatchUpGroup[], courses: Course[]): DigestPending[] {
  const names = new Map(courses.map((c) => [c.id, c.name]));
  return groups
    .map((g) => {
      const what = g.fields.map((f) => f.target.label.toLowerCase()).join(", ");
      const course = names.get(g.courseId);
      const title = g.deadline ? g.deadline.title : (course ?? g.session?.subject ?? g.fields[0].target.label);
      const when = g.deadline ? (course ?? "") : instanceLabel(g.fields[0].instance);
      return { title, detail: when ? `${when}: ${what}` : what, end: g.end };
    })
    .sort((a, b) => b.end.localeCompare(a.end));
}

export interface DigestContent {
  overdue: DigestItem[];
  upcoming: DigestItem[];
  /** Daily digest only: today's classes and exams from the timetable, by start. */
  classesToday: { session: ClassSession; course?: Course }[];
  /** Names of feeds that have been failing for more than a day. */
  failingFeeds: string[];
  /** Requirement results still to record (newest first) and late "Még nincs eredmény" items. */
  pending: DigestPending[];
  awaitingLate: number;
  /** First day of the period (Budapest), today included. */
  from: YMD;
  /**
   * Last day of the period: the Sunday of this week (daily: at least tomorrow), or the last
   * day of this month.
   */
  to: YMD;
}

/**
 * The days a digest covers: from today to the end of this week (weekly) or month (monthly).
 * Sent on Monday or on the 1st, that is the whole week or month. The daily digest covers the
 * rest of the week too (its "A hét hátralévő része" list), and always tomorrow.
 */
export function digestRange(frequency: DigestFrequency, now: Date): { from: YMD; to: YMD } {
  const today = budapestDate(now);
  const sunday = addDays(mondayOf(today), 6);
  if (frequency === "heti") return { from: today, to: sunday };
  if (frequency === "napi") return { from: today, to: dateKey(sunday) === dateKey(today) ? addDays(today, 1) : sunday };
  const [y, m] = today;
  const firstOfNext: YMD = m === 12 ? [y + 1, 1, 1] : [y, m + 1, 1];
  return { from: today, to: addDays(firstOfNext, -1) };
}

export interface DigestInput {
  frequency: DigestFrequency;
  courses: Course[];
  deadlines: Deadline[];
  feeds: IcalFeed[];
  ignoredDuplicatePairs: string[];
  dedupe: boolean;
  failingFeeds?: string[];
  /** Timetable of the snapshot; only the daily digest uses it. */
  classSessions?: ClassSession[];
  /** "Rögzítésre vár" lines (digestPendingFrom) and the number of late awaited results. */
  pending?: DigestPending[];
  awaitingLate?: number;
  now: Date;
}

/** Selects what the digest lists: open overdue (last 14 days) and open deadlines in the period. */
export function collectDigest(input: DigestInput): DigestContent {
  const { now, courses } = input;
  const nowMs = now.getTime();
  const { from, to } = digestRange(input.frequency, now);
  const endMs = budapestInstant(addDays(to, 1), 0, 0).getTime();
  const { visible } = applyDedupe(input.deadlines, input.feeds, input.ignoredDuplicatePairs, input.dedupe, courses);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const overdue: DigestItem[] = [];
  const upcoming: DigestItem[] = [];
  const open = visible
    .filter((d) => !d.done && !Number.isNaN(new Date(d.due).getTime()))
    .sort((a, b) => a.due.localeCompare(b.due));
  for (const d of open) {
    const dueMs = new Date(d.due).getTime();
    const item: DigestItem = {
      deadline: d,
      course: d.courseId ? courseById.get(d.courseId) : undefined,
      critical: d.critical || isCritical(d, now),
      changed: isRecentlyChanged(d, now),
    };
    if (dueMs < nowMs) {
      if (nowMs - dueMs <= OVERDUE_LOOKBACK_MS) overdue.push(item);
    } else if (dueMs < endMs) {
      upcoming.push(item);
    }
  }
  const todayKey = dateKey(from);
  const classesToday =
    input.frequency === "napi"
      ? (input.classSessions ?? [])
          .filter((s) => s.kind !== "szunnap" && dateKey(budapestDate(new Date(s.start))) === todayKey)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((session) => ({ session, course: session.courseId ? courseById.get(session.courseId) : undefined }))
      : [];
  return {
    overdue,
    upcoming,
    classesToday,
    failingFeeds: input.failingFeeds ?? [],
    pending: input.pending ?? [],
    awaitingLate: input.awaitingLate ?? 0,
    from,
    to,
  };
}

/** Upcoming items due on the given Budapest day. */
export function itemsOnDay(items: DigestItem[], day: YMD): DigestItem[] {
  const key = dateKey(day);
  return items.filter((i) => dateKey(budapestDate(new Date(i.deadline.due))) === key);
}

/**
 * Whether a digest is worth a mail. Weekly and monthly ones always go out (an empty one still
 * tells you nothing is due); a daily one only when something is due today or tomorrow, or a
 * class since yesterday morning is still waiting to be recorded (so a class day nags once).
 */
export function shouldSendDigest(frequency: DigestFrequency, content: DigestContent): boolean {
  if (frequency !== "napi") return true;
  const due = itemsOnDay(content.upcoming, content.from).length + itemsOnDay(content.upcoming, addDays(content.from, 1)).length;
  const since = budapestInstant(addDays(content.from, -1), 0, 0).getTime();
  return due > 0 || content.pending.some((p) => Date.parse(p.end) >= since);
}
