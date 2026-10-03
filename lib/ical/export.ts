import ICAL from "ical.js";
import type { Course, Deadline, ExportOptions } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;
const UID_DOMAIN = "hallgatoireteg";
const TIME_ZONE = "Europe/Budapest";

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeDone: false,
  alarms: true,
  weeklySummary: true,
  studyBlocks: true,
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

/** Today's calendar date in Europe/Budapest as [year, month, day]. */
function budapestDate(now: Date): [number, number, number] {
  const text = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = text.split("-").map(Number);
  return [y, m, d];
}

function addAlarm(vevent: ICAL.Component, trigger: string, description: string) {
  const alarm = new ICAL.Component("valarm");
  alarm.addPropertyWithValue("action", "DISPLAY");
  alarm.addPropertyWithValue("description", description);
  alarm.addPropertyWithValue("trigger", ICAL.Duration.fromString(trigger));
  vevent.addSubcomponent(alarm);
}

function buildDeadlineEvent(
  d: Deadline,
  course: Course | undefined,
  options: ExportOptions,
  now: Date,
  appUrl: string | undefined
): ICAL.Component {
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
  vevent.addPropertyWithValue("summary", summary);

  const description: string[] = [];
  if (d.note) description.push(d.note);
  if (d.url) description.push(d.url);
  if (appUrl && course) description.push(`Megnyitás: ${appUrl}/targy/${course.id}`);
  if (description.length > 0) {
    vevent.addPropertyWithValue("description", description.join("\n"));
  }
  if (d.url) vevent.addPropertyWithValue("url", d.url);
  if (course) vevent.addPropertyWithValue("categories", course.name);

  if (options.alarms && d.critical && !d.done) {
    addAlarm(vevent, "-P1D", "Kritikus határidő holnap");
    addAlarm(vevent, "-PT1H", "Kritikus határidő egy óra múlva");
  }
  return vevent;
}

function buildWarningEvent(
  warning: HealthWarning,
  today: [number, number, number],
  now: Date,
  appUrl: string | undefined
): ICAL.Component {
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

  vevent.addPropertyWithValue("summary", `⚠ ${warning.feedName} naptár nem frissül`);
  const settingsUrl = appUrl ? ` (${appUrl}/beallitasok)` : "";
  vevent.addPropertyWithValue(
    "description",
    `A(z) „${warning.feedName}" forrásnaptár több mint egy napja nem frissíthető. ` +
      `Ellenőrizd a naptár címét a Beállításokban${settingsUrl}.`
  );
  return vevent;
}

/**
 * Builds the combined VCALENDAR text. Pure: usable in the browser and on the server.
 * ical.js takes care of escaping and line folding.
 */
export function buildCalendar(input: BuildCalendarInput): string {
  const { courses, deadlines, now, warnings = [] } = input;
  const options: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...input.options };
  const appUrl = input.appUrl?.replace(/\/+$/, "") || undefined;

  const cal = new ICAL.Component("vcalendar");
  cal.addPropertyWithValue("version", "2.0");
  cal.addPropertyWithValue("prodid", "-//Hallgatoi reteg//HU");
  cal.addPropertyWithValue("calscale", "GREGORIAN");
  cal.addPropertyWithValue("method", "PUBLISH");
  cal.addPropertyWithValue("x-wr-calname", "Hallgatói réteg");
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
    cal.addSubcomponent(buildDeadlineEvent(d, course, options, now, appUrl));
  }

  if (warnings.length > 0) {
    const today = budapestDate(now);
    for (const warning of warnings) {
      cal.addSubcomponent(buildWarningEvent(warning, today, now, appUrl));
    }
  }

  return cal.toString();
}
