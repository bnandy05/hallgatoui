import ICAL from "ical.js";
import type { ClassSession, Course, Deadline, ExportOptions, IcalFeed, Platform, SemesterInfo } from "@/lib/types";
import type { RequirementResult, RequirementRules } from "@/lib/rules/types";
import { applyDedupe, deadlineIdentity } from "@/lib/ical/dedupe";
import { catchUpGroupKey, linkedInstances, type CatchUpInput } from "@/lib/catchup";
import { assessmentNotes } from "@/lib/gradeAlerts";
import { getPlatform, platformName } from "@/lib/platforms";
import {
  addDays,
  budapestDate,
  budapestTime,
  dateKey,
  dayAbbreviation,
  formatBudapest,
  mondayOf,
  type YMD,
} from "@/lib/ical/budapest";
import { isRecentlyChanged } from "@/lib/radar";
import { getMessages, type Locale, type Messages } from "@/lib/i18n";
import {
  ALL_VIEW,
  filterDeadlinesForView,
  isExamTitle,
  parseView,
  viewCalendarName,
  viewParam,
  type CalendarView,
} from "@/lib/ical/views";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;
const UID_DOMAIN = "hallgatoireteg";
const TIME_ZONE = "Europe/Budapest";
const SUMMARY_WEEKS = 4; // the current week and the next three
const STUDY_BLOCK_DAYS = 2;
/** How far ahead an assessment gets the grade note ("24/40 kell a 4-eshez") in its description. */
const GRADE_NOTE_DAYS = 60;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeDone: false,
  alarms: true,
  weeklySummary: true,
  studyBlocks: true,
  dedupe: true,
  includeClasses: false,
  gradeInfo: true,
};

export interface HealthWarning {
  feedId: string;
  feedName: string;
}

export interface BuildCalendarInput {
  courses: Course[];
  deadlines: Deadline[];
  options?: Partial<ExportOptions>;
  now: Date;
  /** Origin used for deep links ("https://example.com"); links are omitted without it. */
  appUrl?: string;
  /** Feeds that have not refreshed for a long time; each becomes an all-day notice event. */
  warnings?: HealthWarning[];
  /** Filtered view of the calendar; the full calendar when omitted. */
  view?: CalendarView;
  /** For duplicate detection (options.dedupe) and the "Források" block. */
  feeds?: IcalFeed[];
  customPlatforms?: Platform[];
  ignoredDuplicatePairs?: string[];
  /** Timetable; only exported in the "orarend" view or with options.includeClasses. */
  classSessions?: ClassSession[];
  /** Language of every text in the calendar; Hungarian when omitted. */
  locale?: Locale;
  /** The requirement tracker's data: "record result" links and, with options.gradeInfo, grade notes. */
  requirements?: { rules: RequirementRules[]; results: RequirementResult[]; semester?: SemesterInfo };
}

/**
 * What the app can do for one event, keyed by `d:<deadlineIdentity>` or `s:<session externalUid>`:
 * the catch-up group to open for recording a result, and the grade notes of an upcoming assessment.
 */
interface EventExtra {
  recordGroup?: string;
  notes: string[];
}

/** A merged deadline's extras: its own, or a merged copy's when the component is linked to that one. */
function deadlineExtra(extras: Map<string, EventExtra>, d: Deadline, copies: Deadline[] | undefined): EventExtra | undefined {
  for (const c of [d, ...(copies ?? [])]) {
    const extra = extras.get(`d:${deadlineIdentity(c)}`);
    if (extra) return extra;
  }
  return undefined;
}

/** Links only ever open a page; the change itself is confirmed there with a button. */
function markDoneUrl(appUrl: string, d: Deadline): string {
  return `${appUrl}/?kesz=${encodeURIComponent(deadlineIdentity(d))}`;
}

function recordUrl(appUrl: string, group: string): string {
  return `${appUrl}/?potlas=${encodeURIComponent(group)}`;
}

function eventExtras(input: BuildCalendarInput, options: ExportOptions, locale: Locale): Map<string, EventExtra> {
  const extras = new Map<string, EventExtra>();
  const req = input.requirements;
  if (!req || req.rules.length === 0) return extras;
  const catchUp: CatchUpInput = {
    courses: input.courses,
    rules: req.rules,
    results: req.results,
    sessions: input.classSessions ?? [],
    deadlines: input.deadlines,
    semester: req.semester,
    now: input.now,
  };
  const notes = options.gradeInfo ? assessmentNotes(catchUp, GRADE_NOTE_DAYS, locale) : new Map<string, string[]>();
  for (const li of linkedInstances(catchUp)) {
    const { instance } = li;
    const key = instance.session
      ? `s:${instance.session.externalUid}`
      : instance.deadline
        ? `d:${deadlineIdentity(instance.deadline)}`
        : null;
    if (!key) continue;
    const group = catchUpGroupKey(li);
    const extra = extras.get(key) ?? { notes: [] };
    if (instance.tracked && !instance.pinned && !instance.result) extra.recordGroup = group;
    for (const note of notes.get(group) ?? []) if (!extra.notes.includes(note)) extra.notes.push(note);
    extras.set(key, extra);
  }
  return extras;
}

/** Short non-cryptographic hash (two independent 32-bit hashes, 16 hex chars). */
function shortHash(text: string): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0;
    djb = (Math.imul(djb, 33) + c) >>> 0;
  }
  return fnv.toString(16).padStart(8, "0") + djb.toString(16).padStart(8, "0");
}

/**
 * Stable across regenerations and across devices. iCal-sourced deadlines get different ids
 * in the browser and on the server, so their UID is derived from the feed and source UID.
 */
export function deadlineUid(d: Deadline): string {
  if (d.source === "ical" && d.feedId && d.externalUid) {
    return `ical-${d.feedId}-${shortHash(d.externalUid)}@${UID_DOMAIN}`;
  }
  return `${d.id}@${UID_DOMAIN}`;
}

function utcTime(date: Date): ICAL.Time {
  return ICAL.Time.fromJSDate(date, true);
}

function addAlarm(vevent: ICAL.Component, trigger: string, description: string) {
  const alarm = new ICAL.Component("valarm");
  alarm.addPropertyWithValue("action", "DISPLAY");
  alarm.addPropertyWithValue("description", description);
  alarm.addPropertyWithValue("trigger", ICAL.Duration.fromString(trigger));
  vevent.addSubcomponent(alarm);
}

function sourceName(d: Deadline, feeds: IcalFeed[], customPlatforms: Platform[], t: Messages): string {
  if (d.source === "manual") return t.ics.manual;
  const feed = d.feedId ? feeds.find((f) => f.id === d.feedId) : undefined;
  return platformName(getPlatform(feed?.platformId ?? d.platformId, customPlatforms), t.platforms.other);
}

function buildDeadlineEvent(
  d: Deadline,
  course: Course | undefined,
  options: ExportOptions,
  now: Date,
  appUrl: string | undefined,
  copies: Deadline[] | undefined,
  feeds: IcalFeed[],
  customPlatforms: Platform[],
  extra: EventExtra | undefined,
  locale: Locale
): ICAL.Component {
  const t = getMessages(locale);
  const vevent = new ICAL.Component("vevent");
  const due = new Date(d.due);

  vevent.addPropertyWithValue("uid", deadlineUid(d));
  vevent.addPropertyWithValue("dtstamp", utcTime(now));
  vevent.addPropertyWithValue("dtstart", utcTime(due));
  vevent.addPropertyWithValue("dtend", utcTime(due));

  const label = course ? course.code || course.name : "";
  let summary = label ? `[${label}] ${d.title}` : d.title;
  if (d.critical) summary = `🔴 ${summary}`;
  if (d.done) summary = `✓ ${summary}`;
  const changed = isRecentlyChanged(d, now);
  if (changed) summary = `${summary} (${t.ics.changedMark})`;
  vevent.addPropertyWithValue("summary", summary);

  const description: string[] = [];
  if (changed && d.previousDue) {
    description.push(t.ics.previousDue(formatBudapest(new Date(d.previousDue), locale)));
  }
  if (extra && extra.notes.length > 0) description.push(t.ics.grades, ...extra.notes.map((n) => `• ${n}`));
  if (d.note) description.push(d.note);
  if (d.url) description.push(d.url);
  if (copies && copies.length > 0) {
    description.push(
      t.ics.sources,
      ...[d, ...copies].map((c) => {
        const name = sourceName(c, feeds, customPlatforms, t);
        return c.url ? `• ${name}: ${c.url}` : `• ${name}`;
      })
    );
  }
  if (appUrl && !d.done) description.push(t.ics.markDone(markDoneUrl(appUrl, d)));
  if (appUrl && extra?.recordGroup) description.push(t.ics.record(recordUrl(appUrl, extra.recordGroup)));
  if (appUrl && course) description.push(t.ics.open(`${appUrl}/targy/${course.id}`));
  if (description.length > 0) {
    vevent.addPropertyWithValue("description", description.join("\n"));
  }
  if (d.url) vevent.addPropertyWithValue("url", d.url);
  if (course) vevent.addPropertyWithValue("categories", course.name);

  if (options.alarms && d.critical && !d.done) {
    addAlarm(vevent, "-P1D", t.ics.alarmTomorrow);
    addAlarm(vevent, "-PT1H", t.ics.alarmHour);
  }
  return vevent;
}

function allDayEvent(uid: string, start: YMD, end: YMD, now: Date): ICAL.Component {
  const vevent = new ICAL.Component("vevent");
  vevent.addPropertyWithValue("uid", uid);
  vevent.addPropertyWithValue("dtstamp", utcTime(now));
  vevent.addPropertyWithValue("dtstart", dateValue(start));
  vevent.addPropertyWithValue("dtend", dateValue(end));
  // Informational events must not make the day look busy.
  vevent.addPropertyWithValue("transp", "TRANSPARENT");
  return vevent;
}

function dateValue([year, month, day]: YMD): ICAL.Time {
  return ICAL.Time.fromData({ year, month, day, isDate: true });
}

function courseLabel(d: Deadline, courseById: Map<string, Course>): string {
  const course = d.courseId ? courseById.get(d.courseId) : undefined;
  return course ? course.code || course.name : "";
}

/** One "weekly radar" event per week (current + next 3) that has an open deadline. */
function buildWeeklySummaries(
  deadlines: Deadline[],
  courseById: Map<string, Course>,
  view: CalendarView,
  now: Date,
  locale: Locale
): ICAL.Component[] {
  const t = getMessages(locale);
  const open = deadlines
    .filter((d) => !d.done && !Number.isNaN(new Date(d.due).getTime()))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  const viewSuffix = view.kind === "all" ? "" : `-${viewParam(view).replace(/[^A-Za-z0-9-]/g, "")}`;
  const firstMonday = mondayOf(budapestDate(now));
  const events: ICAL.Component[] = [];

  for (let week = 0; week < SUMMARY_WEEKS; week++) {
    const monday = addDays(firstMonday, week * 7);
    const first = dateKey(monday);
    const last = dateKey(addDays(monday, 6));
    const inWeek = open.filter((d) => {
      const key = dateKey(budapestDate(new Date(d.due)));
      return key >= first && key <= last;
    });
    if (inWeek.length === 0) continue;

    const critical = inWeek.filter((d) => d.critical || isExamTitle(d.title)).length;
    const event = allDayEvent(
      `week-${first}${viewSuffix}@${UID_DOMAIN}`,
      monday,
      addDays(monday, 1),
      now
    );
    event.addPropertyWithValue(
      "summary",
      t.ics.weeklyRadar(inWeek.length, critical)
    );
    const lines = inWeek.map((d) => {
      const due = new Date(d.due);
      const label = courseLabel(d, courseById);
      return `• ${dayAbbreviation(budapestDate(due), locale)} ${budapestTime(due)} ${label ? `[${label}] ` : ""}${d.title}`;
    });
    event.addPropertyWithValue("description", lines.join("\n"));
    events.push(event);
  }
  return events;
}

/** All-day block covering the two Budapest days before a critical deadline. */
function buildStudyBlock(
  d: Deadline,
  course: Course | undefined,
  now: Date,
  locale: Locale
): ICAL.Component {
  const t = getMessages(locale);
  const due = new Date(d.due);
  const dueDay = budapestDate(due);
  const base = deadlineUid(d);
  const event = allDayEvent(`prep-${base}`, addDays(dueDay, -STUDY_BLOCK_DAYS), dueDay, now);
  const label = course ? course.code || course.name : "";
  event.addPropertyWithValue("summary", t.ics.study(label ? `${label}` : "", d.title));
  event.addPropertyWithValue("description", t.ics.dueOn(formatBudapest(due, locale)));
  return event;
}

/** Sessions are identified like feed deadlines: by source and source UID, never by id. */
export function sessionUid(s: ClassSession): string {
  return `class-${s.sourceId}-${shortHash(s.externalUid)}@${UID_DOMAIN}`;
}

function buildSessionEvent(
  s: ClassSession,
  course: Course | undefined,
  now: Date,
  appUrl: string | undefined,
  extra: EventExtra | undefined,
  locale: Locale
): ICAL.Component {
  const t = getMessages(locale);
  const vevent = new ICAL.Component("vevent");
  vevent.addPropertyWithValue("uid", sessionUid(s));
  vevent.addPropertyWithValue("dtstamp", utcTime(now));
  vevent.addPropertyWithValue("dtstart", utcTime(new Date(s.start)));
  vevent.addPropertyWithValue("dtend", utcTime(new Date(s.end)));
  const label = course ? course.code || course.name : "";
  const title = `${s.subject}${s.group ? ` (${s.group})` : ""}`;
  vevent.addPropertyWithValue("summary", `${label && s.kind !== "egyeb" ? `[${label}] ` : ""}${title}`);
  if (s.location) vevent.addPropertyWithValue("location", s.location);
  const description: string[] = [];
  if (extra && extra.notes.length > 0) description.push(t.ics.grades, ...extra.notes.map((n) => `• ${n}`));
  if (s.teachers.length > 0) description.push(t.ics.teachers(s.teachers.join(", ")));
  if (appUrl && extra?.recordGroup) description.push(t.ics.record(recordUrl(appUrl, extra.recordGroup)));
  if (description.length > 0) vevent.addPropertyWithValue("description", description.join("\n"));
  if (course) vevent.addPropertyWithValue("categories", course.name);
  return vevent;
}

function buildHolidayEvent(s: ClassSession, now: Date, locale: Locale): ICAL.Component {
  const day = budapestDate(new Date(s.start));
  const event = allDayEvent(
    `class-${s.sourceId}-${shortHash(s.externalUid)}@${UID_DOMAIN}`,
    day,
    addDays(day, 1),
    now
  );
  event.addPropertyWithValue("summary", getMessages(locale).ics.holiday(s.subject));
  return event;
}

function buildWarningEvent(
  warning: HealthWarning,
  today: [number, number, number],
  now: Date,
  appUrl: string | undefined,
  locale: Locale
): ICAL.Component {
  const t = getMessages(locale);
  const vevent = new ICAL.Component("vevent");
  const [year, month, day] = today;
  const dateKey = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  vevent.addPropertyWithValue("uid", `warn-${warning.feedId}-${dateKey}@${UID_DOMAIN}`);
  vevent.addPropertyWithValue("dtstamp", utcTime(now));

  const start = ICAL.Time.fromData({ year, month, day, isDate: true });
  const end = start.clone();
  end.adjust(1, 0, 0, 0);
  vevent.addPropertyWithValue("dtstart", start);
  vevent.addPropertyWithValue("dtend", end);

  vevent.addPropertyWithValue("summary", t.ics.warningTitle(warning.feedName));
  const settingsUrl = appUrl ? ` (${appUrl}/beallitasok)` : "";
  vevent.addPropertyWithValue("description", t.ics.warningText(warning.feedName, settingsUrl));
  return vevent;
}

/**
 * Builds the combined VCALENDAR text. Pure: usable in the browser and on the server.
 * ical.js takes care of escaping and line folding.
 */
export function buildCalendar(input: BuildCalendarInput): string {
  const { courses, now, warnings = [] } = input;
  const locale = input.locale ?? "hu";
  // Re-parsing guards against a course view whose course no longer exists.
  const view = input.view ? parseView(viewParam(input.view), courses) : ALL_VIEW;
  const options: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...input.options };
  const feeds = input.feeds ?? [];
  const customPlatforms = input.customPlatforms ?? [];
  // Merge duplicates before filtering the view, so a group is judged as a whole.
  const { visible, extras: copies } = applyDedupe(
    input.deadlines,
    feeds,
    input.ignoredDuplicatePairs ?? [],
    options.dedupe,
    courses
  );
  const deadlines = filterDeadlinesForView(visible, view);
  const appUrl = input.appUrl?.replace(/\/+$/, "") || undefined;
  const extras = eventExtras(input, options, locale);

  const cal = new ICAL.Component("vcalendar");
  cal.addPropertyWithValue("version", "2.0");
  cal.addPropertyWithValue("prodid", `-//Hallgatoi reteg//${locale.toUpperCase()}`);
  cal.addPropertyWithValue("calscale", "GREGORIAN");
  cal.addPropertyWithValue("method", "PUBLISH");
  cal.addPropertyWithValue("x-wr-calname", viewCalendarName(view, courses, locale));
  cal.addPropertyWithValue("x-wr-timezone", TIME_ZONE);
  const refresh = new ICAL.Property("refresh-interval");
  refresh.setValue(ICAL.Duration.fromString("PT1H"));
  cal.addProperty(refresh);
  cal.addPropertyWithValue("x-published-ttl", "PT1H");

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const cutoff = now.getTime() - HISTORY_DAYS * DAY_MS;
  const seen = new Set<string>();

  for (const d of deadlines) {
    const dueMs = new Date(d.due).getTime();
    if (Number.isNaN(dueMs) || dueMs < cutoff) continue;
    if (d.done && !options.includeDone) continue;
    const uid = deadlineUid(d);
    if (seen.has(uid)) continue; // UIDs must be unique within a calendar
    seen.add(uid);
    const course = d.courseId ? courseById.get(d.courseId) : undefined;
    cal.addSubcomponent(
      buildDeadlineEvent(d, course, options, now, appUrl, copies.get(d.id), feeds, customPlatforms, deadlineExtra(extras, d, copies.get(d.id)), locale)
    );
    if (options.studyBlocks && d.critical && !d.done && dueMs > now.getTime()) {
      cal.addSubcomponent(buildStudyBlock(d, course, now, locale));
    }
  }

  const sessions = input.classSessions ?? [];
  const includeSessions = view.kind === "timetable" || (options.includeClasses && (view.kind === "all" || view.kind === "course"));
  if (includeSessions) {
    for (const s of sessions) {
      if (view.kind === "course" && s.courseId !== view.courseId) continue;
      if (s.kind === "szunnap") {
        if (view.kind !== "course") cal.addSubcomponent(buildHolidayEvent(s, now, locale));
        continue;
      }
      if (Number.isNaN(new Date(s.start).getTime())) continue;
      cal.addSubcomponent(
        buildSessionEvent(s, s.courseId ? courseById.get(s.courseId) : undefined, now, appUrl, extras.get(`s:${s.externalUid}`), locale)
      );
    }
  }

  if (options.weeklySummary) {
    for (const event of buildWeeklySummaries(deadlines, courseById, view, now, locale)) {
      cal.addSubcomponent(event);
    }
  }

  if (warnings.length > 0 && view.kind !== "timetable") {
    const today = budapestDate(now);
    for (const warning of warnings) {
      cal.addSubcomponent(buildWarningEvent(warning, today, now, appUrl, locale));
    }
  }

  return cal.toString();
}
