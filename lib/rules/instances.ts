// The instances of a requirement component: the classes, teaching weeks or deadlines its link
// selects, each with a stable key that results are stored under. Pure.
//
// Keys never depend on position or on ClassSession.id (each device mints its own):
//   s:<Neptun UID>      a class picked by a "sessions" link
//   w:<week>            a teaching week of a "weeks" link (the class of that week gives the date)
//   d:<deadlineIdentity> a deadline of a "deadlines" link
//   n:<i>               unlinked items (M1); single-result components always use "n:1"
// Instances that already have a result stay in the list ("pinned") even when the link no longer
// selects them, so a changed rule or a re-import never hides a recorded result.

import { getMessages, type Locale } from "@/lib/i18n";
import type { ClassSession, Deadline, SemesterInfo } from "@/lib/types";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import { budapestDate, budapestTime, isoWeekday } from "@/lib/ical/budapest";
import { semesterWeek, weekBounds } from "@/lib/timetable/semester";
import { isMultiInstance, type ComponentLink, type LinkTarget, type SessionSelector } from "./links";
import type { RequirementResult } from "./types";

export const SINGLE_KEY = "n:1";

export interface Instance {
  key: string;
  at?: string; // ISO start
  end?: string; // ISO; the catch-up asks once this has passed
  week?: number;
  session?: ClassSession;
  deadline?: Deadline;
  /** On or after the link's `since`: the catch-up may ask about it. */
  tracked: boolean;
  /** No longer selected by the link; kept because it has a result. */
  pinned: boolean;
  result?: RequirementResult;
}

export interface InstanceContext {
  courseId: string;
  sessions: ClassSession[]; // visible sessions of every course
  deadlines: Deadline[];
  semester?: SemesterInfo;
  results: RequirementResult[]; // any; filtered by course and component here
}

const MINUTE_MS = 60 * 1000;

function matches(s: ClassSession, courseId: string, sel: SessionSelector | undefined, semester: SemesterInfo | undefined, useWeeks: boolean): boolean {
  if (s.courseId !== courseId) return false;
  const kinds = sel?.kinds?.length ? sel.kinds : ["ora"];
  if (!(kinds as string[]).includes(s.kind)) return false;
  if (sel?.groups?.length && !(s.group && sel.groups.includes(s.group))) return false;
  if (sel?.weekdays?.length && !sel.weekdays.includes(isoWeekday(budapestDate(new Date(s.start))))) return false;
  if (useWeeks && semester && (sel?.fromWeek !== undefined || sel?.toWeek !== undefined)) {
    const week = semesterWeek(semester, new Date(s.start));
    if (week === null) return false;
    if (sel?.fromWeek !== undefined && week < sel.fromWeek) return false;
    if (sel?.toWeek !== undefined && week > sel.toWeek) return false;
  }
  return true;
}

function fromSession(key: string, s: ClassSession, semester: SemesterInfo | undefined): Omit<Instance, "tracked" | "pinned"> {
  const week = semester ? semesterWeek(semester, new Date(s.start)) : null;
  return { key, at: s.start, end: s.end, session: s, ...(week !== null && { week }) };
}

function byIdentity(deadlines: Deadline[]): Map<string, Deadline> {
  return new Map(deadlines.map((d) => [deadlineIdentity(d), d]));
}

/** The instance of week `week`: its first matching class, or the whole week as a placeholder. */
function weekInstance(key: string, week: number, link: { selector?: SessionSelector }, ctx: InstanceContext): Omit<Instance, "tracked" | "pinned"> {
  const session = ctx.sessions
    .filter((s) => matches(s, ctx.courseId, link.selector, ctx.semester, false))
    .filter((s) => ctx.semester && semesterWeek(ctx.semester, new Date(s.start)) === week)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (session) return { ...fromSession(key, session, ctx.semester), week };
  const bounds = ctx.semester ? weekBounds(ctx.semester, week) : null;
  return bounds
    ? { key, week, at: bounds.from.toISOString(), end: new Date(bounds.to.getTime() - MINUTE_MS).toISOString() }
    : { key, week };
}

function fromDeadline(key: string, d: Deadline): Omit<Instance, "tracked" | "pinned"> {
  return { key, at: d.due, end: d.due, deadline: d };
}

const tracked = (end: string | undefined, since: string | undefined) =>
  !!end && (!since || Date.parse(end) >= Date.parse(since));

function compareInstances(a: Instance, b: Instance): number {
  if (a.at && b.at) return a.at.localeCompare(b.at) || a.key.localeCompare(b.key, "en", { numeric: true });
  if (a.at) return -1;
  if (b.at) return 1;
  return a.key.localeCompare(b.key, "en", { numeric: true });
}

/** The instances of one component (or retake slot) under its link, oldest first. */
export function resolveInstances(target: LinkTarget, link: ComponentLink | undefined, ctx: InstanceContext): Instance[] {
  const own = ctx.results.filter((r) => r.courseId === ctx.courseId && r.componentId === target.id);
  const resultByKey = new Map(own.map((r) => [r.instanceKey, r]));
  const since = link?.since;
  const out: Instance[] = [];
  const add = (base: Omit<Instance, "tracked" | "pinned">, isTracked = tracked(base.end, since)) =>
    out.push({ ...base, tracked: isTracked, pinned: false, result: resultByKey.get(base.key) });

  if (!isMultiInstance(target)) {
    const due = "due" in target ? target.due : undefined;
    let base: Omit<Instance, "tracked" | "pinned"> = { key: SINGLE_KEY, ...(due && { at: due, end: due }) };
    if (link?.mode === "weeks") {
      base = weekInstance(SINGLE_KEY, link.weeks[0], link, ctx);
    } else if (link?.mode === "deadlines") {
      const d = byIdentity(ctx.deadlines).get(link.identities[0]);
      if (d) base = fromDeadline(SINGLE_KEY, d);
    }
    add(base, link ? tracked(base.end, since) : false);
  } else if (!link) {
    if (target.kind === "series") for (let i = 1; i <= target.count; i++) add({ key: `n:${i}` }, false);
  } else if (link.mode === "sessions") {
    const limit = link.limit ?? (target.kind === "series" ? target.count : undefined);
    let counted = 0;
    const picked = ctx.sessions
      .filter((s) => matches(s, ctx.courseId, link.selector, ctx.semester, true))
      .sort((a, b) => a.start.localeCompare(b.start));
    const seen = new Set<string>();
    for (const s of picked) {
      if (limit !== undefined && counted >= limit) break;
      const key = `s:${s.externalUid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(fromSession(key, s, ctx.semester));
      // A class that didn't happen ("Elmaradt") doesn't use up an item.
      if (resultByKey.get(key)?.state !== "na") counted++;
    }
  } else if (link.mode === "weeks") {
    for (const week of link.weeks) add(weekInstance(`w:${week}`, week, link, ctx));
  } else {
    const deadlines = byIdentity(ctx.deadlines);
    for (const identity of link.identities) {
      const d = deadlines.get(identity);
      if (d) add(fromDeadline(`d:${identity}`, d));
    }
  }

  const keys = new Set(out.map((i) => i.key));
  for (const r of own) {
    if (keys.has(r.instanceKey)) continue;
    out.push({ key: r.instanceKey, at: r.at, end: r.at, tracked: false, pinned: true, result: r });
  }
  return out.sort(compareInstances);
}

/** "okt. 1. (Cs)" / "Oct 1 (Thu)" in Budapest time. */
export function shortDayLabel(at: Date, locale: Locale = "hu"): string {
  const t = getMessages(locale).rules.instances;
  const date = budapestDate(at);
  return t.day(t.monthsShort[date[1] - 1], date[2], t.weekdaysShort[isoWeekday(date) - 1]);
}

/** What an instance is called in lists and snapshots: "okt. 1. (Cs) 16:00 · 4. hét", "Beadandó 1"… */
export function instanceLabel(instance: Instance, locale: Locale = "hu"): string {
  const t = getMessages(locale).rules.instances;
  if (instance.pinned && instance.result?.label) return instance.result.label;
  if (instance.deadline) return instance.deadline.title;
  const parts: string[] = [];
  if (instance.session && instance.at) parts.push(`${shortDayLabel(new Date(instance.at), locale)} ${budapestTime(new Date(instance.at))}`);
  else if (instance.week === undefined && instance.at) parts.push(shortDayLabel(new Date(instance.at), locale));
  if (instance.week !== undefined) parts.push(t.week(instance.week));
  if (parts.length === 0) {
    const n = /^n:(\d+)$/.exec(instance.key);
    return n ? t.item(n[1]) : instance.key;
  }
  return parts.join(" · ");
}

/**
 * The snapshot stored with a result, so it still shows if the instance disappears. The label is
 * stored text in the language of the moment (a display fallback only, never parsed); the live
 * label of an instance that still resolves is generated in the UI language every time.
 */
export function instanceSnapshot(instance: Instance, locale: Locale = "hu"): { at?: string; label: string } {
  return { ...(instance.at && { at: instance.at }), label: instanceLabel(instance, locale).slice(0, 120) };
}
