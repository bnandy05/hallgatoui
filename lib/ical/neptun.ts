import { newId } from "@/lib/id";
import type { ClassSession, Course, SessionKind, TimetableSource } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { normalizeCourseName } from "@/lib/ical/canvas";
import { matchCourseInText } from "@/lib/ical/match";
import { normalizeSearch } from "@/lib/text";
import { budapestDate, budapestInstant, mondayOf } from "@/lib/ical/budapest";

// Neptun timetable export: a static .ics, one VEVENT per class meeting, no RRULE, UTC times,
// SUMMARY "<subject> ( - <group>) - <teachers ;-separated> - <type>". Pure, no store.

export type ParsedSession = Omit<ClassSession, "id" | "sourceId" | "courseId">;

const LESSON_TYPES = new Set(["lesson", "tanora", "ora", "eloadas", "gyakorlat", "labor"]);
const EXAM_TYPES = new Set(["exam", "vizsga"]);
const OTHER_TYPES = new Set(["other event", "egyeb esemeny", "egyeb"]);

function kindOfType(type: string): SessionKind | null {
  const key = normalizeSearch(type);
  if (LESSON_TYPES.has(key)) return "ora";
  if (EXAM_TYPES.has(key)) return "vizsga";
  if (OTHER_TYPES.has(key)) return "egyeb";
  return null;
}

/** The short code in the trailing parentheses of a LOCATION, if it looks like a room code. */
function roomOf(location: string | undefined): string | undefined {
  const match = location?.match(/\(([^\s()]+)\)\s*$/);
  return match && /[-\d]/.test(match[1]) ? match[1] : undefined;
}

/** Parses one event. Never throws: an unknown pattern becomes an "egyeb" session named after the summary. */
export function parseNeptunEvent(event: IcalEventDTO): ParsedSession {
  const location = event.location?.trim() || undefined;
  const base = {
    externalUid: event.uid,
    location,
    room: roomOf(location),
    start: event.start,
    end: event.end ?? event.start,
  };
  const fallback: ParsedSession = {
    ...base,
    kind: "egyeb",
    subject: event.summary,
    subjectKey: normalizeCourseName(event.summary),
    teachers: [],
  };

  // Right to left: the type is the last " - " segment.
  const typeAt = event.summary.lastIndexOf(" - ");
  if (typeAt === -1) return fallback;
  let kind = kindOfType(event.summary.slice(typeAt + 3));
  if (!kind) return fallback;
  const rest = event.summary.slice(0, typeAt).trim();

  let subject: string;
  let group: string | undefined;
  let teachersText = "";
  const grouped = rest.match(/^(.*?)\s*\( - ([^)]*)\)(?:\s*-\s*(.*))?$/);
  if (grouped) {
    subject = grouped[1].trim();
    group = grouped[2].trim() || undefined;
    teachersText = grouped[3] ?? "";
  } else {
    const parts = rest.split(" - ");
    subject = parts[0].trim();
    teachersText = parts.length > 1 ? parts[parts.length - 1] : "";
  }
  if (!subject) return fallback;

  if (normalizeSearch(subject).startsWith("szunnap")) {
    // Holiday: "Szünnap/szünet ( - Mindenszentek)" -> the name is the group part.
    kind = "szunnap";
    subject = group ?? subject;
    group = undefined;
  }

  return {
    ...base,
    kind,
    subject,
    subjectKey: normalizeCourseName(subject),
    group,
    teachers: teachersText
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export function parseNeptunEvents(events: IcalEventDTO[]): ParsedSession[] {
  return events.map(parseNeptunEvent);
}

/**
 * Heuristic for the import UI, to tell the user they picked the wrong file: the calendar is
 * called "Neptun", or most events have a known Neptun type.
 */
export function isNeptunCalendar(events: IcalEventDTO[], text?: string): boolean {
  if (events.length === 0) return false;
  if (text && /^X-WR-CALNAME:\s*Neptun/im.test(text)) return true;
  const recognised = events.filter((e) => {
    const at = e.summary.lastIndexOf(" - ");
    return at !== -1 && kindOfType(e.summary.slice(at + 3)) !== null;
  }).length;
  return recognised / events.length >= 0.6;
}

/** Monday 00:00 Budapest time of the week containing `now`: older sessions are not imported. */
export function timetableCutoff(now: Date): Date {
  return budapestInstant(mondayOf(budapestDate(now)), 0, 0);
}

/** Current-week and future sessions only (holidays follow the same rule). */
export function upcomingSessions(parsed: ParsedSession[], now: Date): ParsedSession[] {
  const cutoff = timetableCutoff(now).getTime();
  return parsed.filter((s) => new Date(s.end).getTime() >= cutoff);
}

export interface SubjectInfo {
  subjectKey: string;
  subject: string;
  groups: string[];
  count: number;
}

/** Distinct subjects (holidays excluded) with their groups and class counts, sorted by name. */
export function summarizeSubjects(sessions: Pick<ParsedSession, "kind" | "subject" | "subjectKey" | "group">[]): SubjectInfo[] {
  const byKey = new Map<string, SubjectInfo & { groupSet: Set<string> }>();
  for (const s of sessions) {
    if (s.kind === "szunnap") continue;
    let info = byKey.get(s.subjectKey);
    if (!info) {
      info = { subjectKey: s.subjectKey, subject: s.subject, groups: [], count: 0, groupSet: new Set() };
      byKey.set(s.subjectKey, info);
    }
    info.count += 1;
    if (s.group) info.groupSet.add(s.group);
  }
  return [...byKey.values()]
    .map(({ groupSet, ...info }) => ({ ...info, groups: [...groupSet].sort() }))
    .sort((a, b) => a.subject.localeCompare(b.subject, "hu"));
}

/**
 * Replaces the sessions of `source` with the freshly parsed ones (upsert by externalUid, so
 * ids stay stable) and takes each session's course from `source.subjectCourses`. Sessions of
 * other sources are kept as they are.
 */
export function mergeTimetableImport(
  source: TimetableSource,
  parsed: ParsedSession[],
  existing: ClassSession[]
): ClassSession[] {
  const previousByUid = new Map<string, ClassSession>();
  for (const s of existing) if (s.sourceId === source.id) previousByUid.set(s.externalUid, s);

  const seen = new Set<string>();
  const next: ClassSession[] = [];
  for (const p of parsed) {
    if (seen.has(p.externalUid)) continue;
    seen.add(p.externalUid);
    next.push({
      ...p,
      id: previousByUid.get(p.externalUid)?.id ?? newId(),
      sourceId: source.id,
      courseId: p.kind === "szunnap" ? null : (source.subjectCourses[p.subjectKey] ?? null),
    });
  }
  return [...existing.filter((s) => s.sourceId !== source.id), ...next];
}

/** Re-applies a source's subject mapping to its sessions. */
export function applySubjectMapping(
  source: TimetableSource,
  sessions: ClassSession[]
): ClassSession[] {
  return sessions.map((s) =>
    s.sourceId === source.id && s.kind !== "szunnap"
      ? { ...s, courseId: source.subjectCourses[s.subjectKey] ?? null }
      : s
  );
}

/** The first upcoming class or exam of a course. */
export function nextSessionFor(
  courseId: string,
  sessions: ClassSession[],
  now: Date
): ClassSession | undefined {
  const nowMs = now.getTime();
  return sessions
    .filter((s) => s.courseId === courseId && (s.kind === "ora" || s.kind === "vizsga") && new Date(s.end).getTime() >= nowMs)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

/**
 * Drops the sessions of subjects the user skipped ("Kihagyás": mapping entry is null).
 * Unmapped subjects (no entry at all) stay, so they show with a neutral dot until mapped.
 */
export function visibleSessions(sessions: ClassSession[], sources: TimetableSource[]): ClassSession[] {
  const bySource = new Map(sources.map((s) => [s.id, s]));
  return sessions.filter(
    (s) => s.kind === "szunnap" || bySource.get(s.sourceId)?.subjectCourses[s.subjectKey] !== null
  );
}

/** Subjects of classes that have no mapping entry at all (neither a course nor "skip"). */
export function unmappedSubjects(sessions: ClassSession[], sources: TimetableSource[]): SubjectInfo[] {
  const bySource = new Map(sources.map((s) => [s.id, s]));
  return summarizeSubjects(
    sessions.filter((s) => {
      const source = bySource.get(s.sourceId);
      return !!source && s.kind !== "szunnap" && source.subjectCourses[s.subjectKey] === undefined;
    })
  );
}

/** A normalised exact name match, or a keyword hit; null otherwise (rare for English names). */
export function suggestCourseForSubject(subject: string, courses: Course[]): string | null {
  const key = normalizeCourseName(subject);
  return (
    courses.find((c) => normalizeCourseName(c.name) === key)?.id ?? matchCourseInText(subject, courses)
  );
}
