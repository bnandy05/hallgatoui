import type { AppData, CatchUpState, ClassSession, Course, Deadline, IcalFeed, SemesterArchive, SemesterInfo, TimetableSource } from "@/lib/types";
import { normalizeLinkUrl } from "@/lib/url";
import { validateRules } from "@/lib/rules/validate";
import { linksFrom } from "@/lib/rules/links";
import { alertPrefsFrom } from "@/lib/alertPrefs";
import { normalizeSemesterStart } from "@/lib/timetable/semester";
import type { RequirementResult, RequirementRules, ResultValue } from "@/lib/rules/types";
import { MAX_SEMESTER_NAME, selectSemester } from "@/lib/semesterArchive";

export const MAX_REQUIREMENTS_CHARS = 20_000;

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Re-validates every user-visible URL so a crafted backup can't inject unsafe hrefs; caps free text. */
function sanitizeUrls(data: AppData): AppData {
  const courses = data.courses.map(({ requirements, ...c }) => ({
    ...c,
    ...(typeof requirements === "string" && requirements.trim()
      ? { requirements: requirements.slice(0, MAX_REQUIREMENTS_CHARS) }
      : {}),
    links: c.links.flatMap((l) => {
      const url = normalizeLinkUrl(String(l.url ?? ""));
      return url ? [{ ...l, url }] : [];
    }),
    resources: c.resources.flatMap((r) => {
      const url = normalizeLinkUrl(String(r.url ?? ""));
      return url ? [{ ...r, url }] : [];
    }),
  }));
  const deadlines = data.deadlines.map((d) => ({
    ...d,
    url: d.url ? (normalizeLinkUrl(d.url) ?? undefined) : undefined,
  }));
  const feeds = data.feeds
    .filter((f: IcalFeed) => isHttpUrl(f.url))
    .map((f: IcalFeed) =>
      Array.isArray(f.discovered)
        ? {
            ...f,
            discovered: f.discovered.map((c) =>
              c.courseUrl && !isHttpUrl(c.courseUrl) ? { ...c, courseUrl: undefined } : c
            ),
          }
        : f
    );
  return { ...data, courses, deadlines, feeds };
}

function isCourseShaped(value: unknown): value is Course {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    Array.isArray(c.links) &&
    Array.isArray(c.resources) &&
    Array.isArray(c.matchKeywords)
  );
}

function isDeadlineShaped(value: unknown): value is Deadline {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.title === "string" &&
    typeof d.due === "string" &&
    typeof d.done === "boolean" &&
    typeof d.critical === "boolean" &&
    (d.source === "manual" || d.source === "ical")
  );
}

const SESSION_KINDS = ["ora", "vizsga", "szunnap", "egyeb"];

/** Drops malformed timetable entries instead of failing the whole import. */
function sessionsFrom(value: unknown): ClassSession[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is ClassSession => {
    if (!s || typeof s !== "object") return false;
    const o = s as Record<string, unknown>;
    return (
      typeof o.id === "string" &&
      typeof o.sourceId === "string" &&
      typeof o.externalUid === "string" &&
      typeof o.subject === "string" &&
      typeof o.subjectKey === "string" &&
      typeof o.start === "string" &&
      typeof o.end === "string" &&
      SESSION_KINDS.includes(o.kind as string) &&
      Array.isArray(o.teachers) &&
      (o.courseId === null || typeof o.courseId === "string")
    );
  });
}

function sourcesFrom(value: unknown): TimetableSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is TimetableSource => {
    if (!s || typeof s !== "object") return false;
    const o = s as Record<string, unknown>;
    return (
      typeof o.id === "string" &&
      typeof o.name === "string" &&
      typeof o.importedAt === "string" &&
      !!o.subjectCourses &&
      typeof o.subjectCourses === "object"
    );
  });
}


/** Keeps the rule sets that pass the rules validator, one per course. */
function requirementRulesFrom(value: unknown, courseIds: Set<string>): RequirementRules[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RequirementRules[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.courseId !== "string" || !courseIds.has(o.courseId) || seen.has(o.courseId)) continue;
    const checked = validateRules(o);
    if (!checked.ok) continue;
    seen.add(o.courseId);
    const calendarLinks = linksFrom(o.calendarLinks, checked.rules);
    const ids = new Set([...checked.rules.components.map((c) => c.id), ...checked.rules.retakes.map((r) => r.id)]);
    const autoLinked = Array.isArray(o.autoLinked) ? [...new Set(o.autoLinked.filter((x): x is string => typeof x === "string" && ids.has(x)))] : [];
    out.push({
      ...checked.rules,
      ...(calendarLinks && { calendarLinks }),
      ...(autoLinked.length > 0 && { autoLinked }),
      id: `rules:${o.courseId}`,
      courseId: o.courseId,
      source: o.source === "template" || o.source === "extracted" ? o.source : "manual",
      ...(typeof o.templateId === "string" && o.templateId.length <= 100 && { templateId: o.templateId }),
      ...(typeof o.updatedAt === "string" && { updatedAt: o.updatedAt }),
    });
  }
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function resultValueFrom(value: unknown): ResultValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case "points": {
      if (!finite(v.points)) return undefined;
      const parts =
        v.parts && typeof v.parts === "object" && !Array.isArray(v.parts)
          ? Object.fromEntries(Object.entries(v.parts as Record<string, unknown>).filter((e): e is [string, number] => finite(e[1])))
          : undefined;
      return { kind: "points", points: v.points, ...(parts && Object.keys(parts).length > 0 && { parts }) };
    }
    case "grade":
      return [1, 2, 3, 4, 5].includes(v.grade as number) ? { kind: "grade", grade: v.grade as 1 | 2 | 3 | 4 | 5 } : undefined;
    case "pm":
      return v.sign === "+" || v.sign === "-" ? { kind: "pm", sign: v.sign } : undefined;
    case "attendance":
      return v.status === "present" || v.status === "excused" || v.status === "unexcused"
        ? { kind: "attendance", status: v.status }
        : undefined;
    case "assignment":
      return typeof v.outcome === "string" ? { kind: "assignment", outcome: v.outcome } : undefined;
    case "quiz":
      return finite(v.bestPercent) && typeof v.onTime === "boolean"
        ? { kind: "quiz", bestPercent: v.bestPercent, onTime: v.onTime, ...(finite(v.attemptsUsed) && { attemptsUsed: v.attemptsUsed }) }
        : undefined;
    case "bonus":
      return finite(v.points)
        ? { kind: "bonus", points: v.points, ...(typeof v.note === "string" && { note: v.note.slice(0, 200) }) }
        : undefined;
    default:
      return undefined;
  }
}

/** Keeps well-formed results of existing courses; the id is rebuilt from its parts. */
function requirementResultsFrom(value: unknown, courseIds: Set<string>): RequirementResult[] {
  if (!Array.isArray(value)) return [];
  const out: RequirementResult[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.courseId !== "string" || !courseIds.has(o.courseId)) continue;
    if (typeof o.componentId !== "string" || !/^[a-z][a-z0-9_]*$/.test(o.componentId) || o.componentId.length > 40) continue;
    if (typeof o.instanceKey !== "string" || o.instanceKey.length === 0 || o.instanceKey.length > 200) continue;
    if (o.state !== "recorded" && o.state !== "pending" && o.state !== "na") continue;
    const id = `${o.courseId}|${o.componentId}|${o.instanceKey}`;
    if (seen.has(id)) continue;
    const resultValue = resultValueFrom(o.value);
    if (o.state === "recorded" && !resultValue) continue;
    seen.add(id);
    out.push({
      id,
      courseId: o.courseId,
      componentId: o.componentId,
      instanceKey: o.instanceKey,
      state: o.state,
      ...(resultValue && { value: resultValue }),
      ...(typeof o.retakeOf === "string" && o.retakeOf.length <= 40 && { retakeOf: o.retakeOf }),
      ...(typeof o.at === "string" && o.at.length <= 40 && { at: o.at }),
      ...(typeof o.label === "string" && { label: o.label.slice(0, 120) }),
      ...(typeof o.updatedAt === "string" && { updatedAt: o.updatedAt }),
    });
  }
  return out;
}

function semesterFrom(value: unknown): SemesterInfo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const start = typeof o.start === "string" ? normalizeSemesterStart(o.start) : null;
  if (!start) return undefined;
  return { start, ...(typeof o.updatedAt === "string" && o.updatedAt.length <= 40 && { updatedAt: o.updatedAt }) };
}

function catchUpFrom(value: unknown): CatchUpState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const at = (value as Record<string, unknown>).promptedUntil;
  return typeof at === "string" && at.length <= 40 && Number.isFinite(Date.parse(at)) ? { promptedUntil: at } : undefined;
}

const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as Record<K, V>));

const MAX_TOMBSTONES = 5000;

/** Keeps the string-to-string entries of a tombstone map (newest first, capped). */
function tombstonesFrom(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === "string" && e[0].length <= 200
  );
  entries.sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0));
  return Object.fromEntries(entries.slice(0, MAX_TOMBSTONES));
}

/** Why a backup file was rejected; callers pick the wording in the UI language from the code. */
export class ImportError extends Error {
  readonly code: "invalid" | "unsupported_version";
  constructor(code: "invalid" | "unsupported_version") {
    super(code);
    this.name = "ImportError";
    this.code = code;
  }
}

function semesterArchivesFrom(value: unknown, activeNumber: number): SemesterArchive[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ImportError("invalid");
  const seen = new Set<number>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new ImportError("invalid");
    const { number, name, archivedAt, data } = entry as Record<string, unknown>;
    if (
      typeof number !== "number" || !Number.isSafeInteger(number) || number < 0 || number >= activeNumber || seen.has(number) ||
      typeof name !== "string" || !name.trim() || name.length > MAX_SEMESTER_NAME ||
      typeof archivedAt !== "string" || !Number.isFinite(Date.parse(archivedAt)) ||
      !data || typeof data !== "object" || Array.isArray(data)
    ) throw new ImportError("invalid");
    seen.add(number);
    const snapshot = parseAppData({ ...data, version: 1, customPlatforms: [], semesterArchives: undefined, semesterNumber: undefined });
    return { number, name: name.trim(), archivedAt: new Date(archivedAt).toISOString(), data: selectSemester(snapshot) };
  }).sort((a, b) => a.number - b.number);
}

/**
 * Validates an arbitrary JSON value as an AppData export and returns it
 * typed. Throws an ImportError when the shape doesn't match.
 */
export function parseAppData(json: unknown): AppData {
  if (!json || typeof json !== "object") {
    throw new ImportError("invalid");
  }

  const data = json as Record<string, unknown>;

  if (data.version !== 1) {
    throw new ImportError("unsupported_version");
  }

  if (
    !Array.isArray(data.courses) ||
    !Array.isArray(data.deadlines) ||
    !Array.isArray(data.customPlatforms) ||
    !Array.isArray(data.feeds)
  ) {
    throw new ImportError("invalid");
  }

  if (!data.courses.every(isCourseShaped)) {
    throw new ImportError("invalid");
  }

  if (!data.deadlines.every(isDeadlineShaped)) {
    throw new ImportError("invalid");
  }

  const semesterNumber = data.semesterNumber ?? 0;
  if (typeof semesterNumber !== "number" || !Number.isSafeInteger(semesterNumber) || semesterNumber < 0) {
    throw new ImportError("invalid");
  }
  const archives = semesterArchivesFrom(data.semesterArchives, semesterNumber);

  return sanitizeUrls({
    version: 1,
    courses: data.courses,
    deadlines: data.deadlines,
    customPlatforms: data.customPlatforms as AppData["customPlatforms"],
    feeds: data.feeds as AppData["feeds"],
    classSessions: sessionsFrom(data.classSessions),
    timetableSources: sourcesFrom(data.timetableSources),
    requirementRules: requirementRulesFrom(data.requirementRules, new Set(data.courses.map((c) => c.id))),
    requirementResults: requirementResultsFrom(data.requirementResults, new Set(data.courses.map((c) => c.id))),
    tombstones: tombstonesFrom(data.tombstones),
    ...optional("semester", semesterFrom(data.semester)),
    ...optional("catchUp", catchUpFrom(data.catchUp)),
    ...optional("alertPrefs", alertPrefsFrom(data.alertPrefs)),
    ...(semesterNumber > 0 && { semesterNumber }),
    ...(archives.length > 0 && { semesterArchives: archives }),
    ignoredDuplicatePairs: Array.isArray(data.ignoredDuplicatePairs)
      ? data.ignoredDuplicatePairs
          .filter((p): p is string => typeof p === "string" && p.length <= 600)
          .slice(0, 2000)
      : [],
  });
}
