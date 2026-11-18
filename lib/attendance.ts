// Attendance shares the requirement result ledger. Standalone groups use deterministic IDs;
// linking requirements moves those answers to the real component instead of counting twice.
import type { AttendancePrefs, ClassSession, Course, SemesterInfo } from "@/lib/types";
import type { AttendanceComponent, RequirementResult, RequirementRules } from "@/lib/rules/types";
import { resultId } from "@/lib/rules/types";
import { resolveInstances, type Instance } from "@/lib/rules/instances";
import type { ComponentLink } from "@/lib/rules/links";

export interface AttendanceInput {
  courses: Course[];
  sessions: ClassSession[];
  rules: RequirementRules[];
  results: RequirementResult[];
  semester?: SemesterInfo;
  attendancePrefs?: AttendancePrefs;
}
export interface AttendanceGroup {
  courseId: string;
  target: AttendanceComponent;
  instances: Instance[];
  linked: boolean;
  limitFromRules?: boolean;
}

export function attendanceGroupId(session: Pick<ClassSession, "subjectKey" | "group">): string {
  const key = JSON.stringify([session.subjectKey, session.group ?? ""]);
  let a = 2166136261;
  let b = 5381;
  for (const ch of key) {
    a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ ch.charCodeAt(0);
  }
  return `attendance_${(a >>> 0).toString(36)}_${(b >>> 0).toString(36)}`;
}
export const MANUAL_ATTENDANCE = "attendance_manual";
export const isAttendanceResult = (r: RequirementResult) => r.value?.kind === "attendance" || r.componentId.startsWith("attendance_");

/** Active rule groups first, then uncovered timetable groups and retained historical answers. */
export function attendanceGroups(input: AttendanceInput): AttendanceGroup[] {
  const out: AttendanceGroup[] = [];
  for (const course of input.courses) {
    const rules = input.rules.find((r) => r.courseId === course.id);
    const results = input.results.filter((r) => r.courseId === course.id);
    const sessions = input.sessions.filter((s) => s.courseId === course.id && s.kind === "ora");
    const covered = new Set<string>();
    const componentIds = new Set<string>();
    for (const target of rules?.components ?? []) {
      if (target.kind !== "attendance") continue;
      componentIds.add(target.id);
      const instances = resolveInstances(target, rules?.calendarLinks?.[target.id], {
        courseId: course.id, sessions, deadlines: [], results, semester: input.semester,
      });
      for (const i of instances) {
        if (i.session || i.result) covered.add(i.key);
        if (i.session) covered.add(`s:${i.session.externalUid}`);
      }
      const max = course.attendanceLimits?.[target.id];
      const effective = !target.limit && max !== undefined ? { ...target, limit: { maxAbsences: max, countExcused: true, onExceed: "none" as const } } : target;
      out.push({ courseId: course.id, target: effective, instances, linked: true, limitFromRules: !!target.limit });
    }
    const byGroup = new Map<string, AttendanceGroup>();
    const group = (id: string, label: string) => {
      let value = byGroup.get(id);
      if (!value) {
        const max = course.attendanceLimits?.[id];
        value = { courseId: course.id, linked: false, instances: [], target: {
          id, kind: "attendance", label,
          ...(max !== undefined && { limit: { maxAbsences: max, countExcused: true, onExceed: "none" } }),
        } };
        byGroup.set(id, value);
      }
      return value;
    };
    const seen = new Set<string>();
    for (const s of sessions.sort((a, b) => a.start.localeCompare(b.start))) {
      const key = `s:${s.externalUid}`;
      if (covered.has(key) || seen.has(key)) continue;
      seen.add(key);
      const result = results.find((r) => r.instanceKey === key && isAttendanceResult(r) && !componentIds.has(r.componentId));
      const id = attendanceGroupId(s);
      const value = group(id, [s.subject, s.group].filter(Boolean).join(" · "));
      value.instances.push({ key, at: s.start, end: s.end, session: s, result,
        tracked: !!input.attendancePrefs && Date.parse(s.end) >= Date.parse(input.attendancePrefs.since), pinned: false });
    }
    for (const r of results) {
      if (componentIds.has(r.componentId) || !isAttendanceResult(r) || covered.has(r.instanceKey) || seen.has(r.instanceKey)) continue;
      group(r.componentId, course.name).instances.push({ key: r.instanceKey, at: r.at, end: r.at, result: r, tracked: false, pinned: true });
    }
    if (out.every((g) => g.courseId !== course.id) && byGroup.size === 0) group(MANUAL_ATTENDANCE, course.name);
    out.push(...byGroup.values());
  }
  return out;
}

export function attendanceSummary(group: AttendanceGroup, now: Date) {
  let absences = 0;
  let unrecorded = 0;
  for (const i of group.instances) {
    const r = i.result;
    if (r?.state === "recorded" && r.value?.kind === "attendance") {
      if (r.value.status === "unexcused" || (r.value.status === "excused" && (group.target.limit?.countExcused ?? true))) absences++;
    } else if ((!r || r.state === "pending") && i.end && Date.parse(i.end) <= now.getTime()) unrecorded++;
  }
  const limit = group.target.limit?.maxAbsences;
  const remaining = limit === undefined ? undefined : limit - absences;
  return { absences, unrecorded, limit, remaining,
    tone: remaining === undefined || remaining > 1 ? "normal" : remaining === 1 ? "warning" : "danger" } as const;
}

/** Automatic prompts respect both switches and activation; explicit history never does. */
export function attendancePromptAllowed(input: AttendanceInput, courseId: string, end: string): boolean {
  return !!input.attendancePrefs?.enabled && input.courses.find((c) => c.id === courseId)?.attendanceReminders !== false &&
    Date.parse(end) >= Date.parse(input.attendancePrefs.since);
}

/** Transfer standalone/orphaned answers when a real attendance component acquires a link. */
export function reconcileAttendance(input: AttendanceInput): RequirementResult[] {
  const additions = new Map<string, RequirementResult>();
  const consumed = new Set<string>();
  for (const rules of input.rules) {
    const activeIds = new Set(rules.components.filter((c) => c.kind === "attendance").map((c) => c.id));
    const candidates = input.results.filter((r) => r.courseId === rules.courseId && !activeIds.has(r.componentId) && isAttendanceResult(r));
    if (!candidates.length) continue;
    for (const target of rules.components) {
      if (target.kind !== "attendance" || !rules.calendarLinks?.[target.id]) continue;
      const instances = resolveInstances(target, rules.calendarLinks[target.id], {
        courseId: rules.courseId, sessions: input.sessions, deadlines: [], semester: input.semester, results: input.results,
      });
      for (const instance of instances) {
        if (instance.pinned) continue;
        const matches = candidates.filter((r) => r.instanceKey === instance.key || (instance.session && r.instanceKey === `s:${instance.session.externalUid}`));
        const previous = matches.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
        if (!previous) continue;
        if (!instance.result || (previous.updatedAt ?? "") > (instance.result.updatedAt ?? "")) {
          const id = resultId(rules.courseId, target.id, instance.key);
          additions.set(id, { ...previous, id, componentId: target.id, instanceKey: instance.key });
        }
        matches.forEach((r) => consumed.add(r.id));
      }
    }
  }
  if (!additions.size && !consumed.size) return input.results;
  return [...input.results.filter((r) => !consumed.has(r.id) && !additions.has(r.id)), ...additions.values()];
}

/** Catch-up fields for standalone timetable groups; rule fields come from the normal resolver. */
export function standaloneAttendance(input: AttendanceInput) {
  return attendanceGroups(input).filter((g) => !g.linked).flatMap((g) => g.instances.filter((i) => i.session).map((instance) => ({
    courseId: g.courseId, target: g.target, link: { mode: "sessions", selector: {} } as ComponentLink, instance,
  })));
}
