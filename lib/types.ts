export type PlatformId = string; // built-in ids below or "custom-<id>"

export interface Platform {
  id: PlatformId;
  name: string;
  color: string; // hex
  builtIn: boolean;
}

export interface CourseLink {
  id: string;
  platformId: PlatformId;
  label?: string;
  url: string;
}

export type ResourceKind = "jegyzet" | "zh" | "megoldas" | "video" | "egyeb";

export interface Resource {
  id: string;
  title: string;
  url: string;
  kind: ResourceKind;
  note?: string;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  semester?: string;
  color: string;
  links: CourseLink[];
  resources: Resource[];
  matchKeywords: string[]; // used to auto-assign iCal events
  createdAt: string;
}

export type DeadlineSource = "manual" | "ical";

export interface Deadline {
  id: string;
  courseId: string | null;
  title: string;
  due: string; // ISO
  platformId?: PlatformId;
  url?: string;
  note?: string;
  critical: boolean;
  done: boolean;
  source: DeadlineSource;
  feedId?: string;
  externalUid?: string;
  previousDue?: string; // ISO, the due date before the last change reported by the feed
  dueChangedAt?: string; // ISO, when that change was noticed
}

export type CourseKind = "Ea" | "Gy" | "Lab"; // lecture / practice / lab

/** A course context (e.g. one Canvas course) parsed from calendar events. */
export interface CanvasContext {
  key: string; // "canvas:<host>:<courseId>" or "label:<label>"
  label: string; // raw bracket text
  semester?: string; // "2026/27/1"
  code?: string; // "IP-18DM1E 1"
  name: string; // "Diszkrét matematika I Ea"
  baseName: string; // name without kind: "Diszkrét matematika I"
  groupKey: string; // normalized baseName, groups Ea/Gy variants
  kind?: CourseKind;
  courseUrl?: string;
}

export interface DiscoveredContext extends CanvasContext {
  eventCount: number;
}

export interface IcalFeed {
  id: string;
  name: string;
  url: string;
  platformId: PlatformId;
  courseId: string | null;
  lastSyncedAt?: string;
  lastError?: string;
  discovered?: DiscoveredContext[]; // contexts seen in the last sync (all events)
  ignoredContexts?: string[]; // context keys the user chose to skip
  markDoneBefore?: string; // ISO; deadlines created by a sync that are due before it start as done
}

export type SessionKind = "ora" | "vizsga" | "szunnap" | "egyeb";

/** One class meeting (or holiday) of a timetable import. Not a deadline. */
export interface ClassSession {
  id: string;
  sourceId: string; // TimetableSource.id
  externalUid: string; // VEVENT UID
  kind: SessionKind;
  subject: string; // raw subject name ("Discrete mathematics I"), holiday name for szunnap
  subjectKey: string; // normalizeCourseName(subject), the mapping key
  group?: string; // "4"
  teachers: string[];
  location?: string; // full LOCATION
  room?: string; // short code in the trailing parentheses: "LD-0-821-01-11"
  start: string; // ISO
  end: string; // ISO (== start for holidays)
  courseId: string | null;
}

export interface TimetableSource {
  id: string;
  name: string; // "Neptun órarend"
  url?: string; // only when added by URL (re-fetchable through /api/ical)
  importedAt: string;
  subjectCourses: Record<string, string | null>; // subjectKey -> courseId (null = skipped)
}

export interface AppData {
  version: 1;
  courses: Course[];
  deadlines: Deadline[];
  customPlatforms: Platform[];
  feeds: IcalFeed[];
  /** Pair keys (see lib/ical/dedupe.ts) the user marked "Nem duplikátum". Defaults to []. */
  ignoredDuplicatePairs: string[];
  /** Imported timetable (Neptun). Defaults to []. */
  classSessions: ClassSession[];
  timetableSources: TimetableSource[];
}

/**
 * Device-level notification preferences. Deliberately not part of AppData: they are not
 * exported/imported and importData leaves them alone.
 */
export interface NotificationPrefs {
  enabled: boolean;
  leadMinutes: number[]; // e.g. [1440, 60]
  criticalOnly: boolean; // only deadlines with critical === true
}

/** Options of the combined calendar (.ics download and subscription). */
export interface ExportOptions {
  includeDone: boolean; // also list finished deadlines (prefixed with a check mark)
  alarms: boolean; // VALARMs for critical deadlines
  weeklySummary: boolean; // all-day "Heti radar" event on the Monday of the next 4 weeks
  studyBlocks: boolean; // all-day study block for the 2 days before a critical deadline
  /**
   * Merge the same deadline from several sources into one. Governs the in-app lists too
   * (home, radar, course page, search, notifications), not only the calendar.
   */
  dedupe: boolean;
  includeClasses: boolean; // also put the timetable into "összes" and the course views
}

/** What the server's calendar and digest are built from (see lib/server/calendarInput.ts). */
export interface CalendarSnapshot {
  courses: Course[];
  deadlines: Deadline[];
  feeds: IcalFeed[];
  customPlatforms: Platform[];
  ignoredDuplicatePairs: string[];
  classSessions: ClassSession[]; // the server never re-fetches timetables
  options: ExportOptions;
}
