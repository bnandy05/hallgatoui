import { attendanceGroups, attendanceSummary } from "@/lib/attendance";
import { pendingInputs, linkedInstances, upcomingAssessments, awaitingResults, type CatchUpInput } from "@/lib/catchup";
import { gradeAlerts } from "@/lib/gradeAlerts";
import { getMessages, type Locale } from "@/lib/i18n";
import { componentCourseIds } from "./system";

export interface StudentAction {
  key: string;
  label: string;
  courseId: string;
  date?: string;
  priority: number;
  section: "course-attendance" | "course-requirements";
  groupKey?: string;
}

export function studentActions(input: CatchUpInput, locale: Locale): StudentAction[] {
  const t = getMessages(locale);
  const start = input.now.getTime();
  const end = start + 7 * 86_400_000;
  const upcoming = (date?: string) => date && Date.parse(date) >= start && Date.parse(date) < end;
  const linked = linkedInstances(input);
  const assessments = upcomingAssessments(input, linked, 7, true);
  const alerts = gradeAlerts(input, locale, linked);
  const rules = new Map(input.rules.map((r) => [r.courseId, r]));
  const actions: StudentAction[] = [];

  for (const a of assessments) {
    if (!upcoming(a.instance.at)) continue;
    const key = `${a.courseId}:${a.target.id}:${a.instance.key}`;
    const alert = alerts.find((v) => v.key.startsWith(`risk:hard:${key}:`))
      ?? alerts.find((v) => v.key.startsWith(`opportunity:${key}:`));
    const system = rules.get(a.courseId);
    const member = system ? componentCourseIds(system, a.target.id)[0] : undefined;
    actions.push({
      key: `assessment:${key}`, label: alert?.text ?? a.target.label,
      courseId: a.instance.session?.courseId ?? a.instance.deadline?.courseId ?? member ?? a.courseId,
      priority: alert?.severity === "warning" ? 1 : 3, date: a.instance.at, section: "course-requirements",
    });
  }

  for (const group of attendanceGroups(input)) {
    const { remaining } = attendanceSummary(group, input.now);
    if (remaining === undefined || remaining > 1) continue;
    const next = group.instances.filter((i) => i.session && upcoming(i.at) && i.result?.state !== "na").sort((a, b) => a.at!.localeCompare(b.at!))[0];
    if (!next && remaining >= 0) continue;
    const standing = t.rules.standing;
    actions.push({
      key: `attendance:${group.courseId}:${group.target.id}`,
      courseId: next?.session?.courseId ?? group.courseId,
      label: remaining < 0 ? standing.overLimit : remaining === 0 ? standing.noneLeft : standing.oneLeft,
      date: next?.at, priority: remaining < 0 ? 0 : 1, section: "course-attendance",
    });
  }

  for (const group of pendingInputs(input, linked)) {
    if (Date.parse(group.end) < start - 7 * 86_400_000) continue;
    const field = group.fields.find((f) => f.target.kind !== "attendance") ?? group.fields[0];
    actions.push({
      key: group.key, courseId: group.courseId, groupKey: group.key,
      label: t.trackerPlanning.record(group.deadline?.title ?? field.target.label),
      date: group.end, priority: 2, section: "course-requirements",
    });
  }
  for (const item of awaitingResults(input)) {
    if (!item.overdue) continue;
    const system = rules.get(item.courseId);
    const courseId = system ? componentCourseIds(system, item.result.componentId)[0] ?? item.courseId : item.courseId;
    actions.push({
      key: item.result.id, courseId, label: `${item.componentLabel} · ${t.trackerPlanning.resultPending}`,
      priority: 4, section: "course-requirements",
    });
  }

  return [...new Map(actions.map((a) => [a.key, a])).values()].sort(
    (a, b) => a.priority - b.priority || (a.date ?? "~").localeCompare(b.date ?? "~") || a.key.localeCompare(b.key),
  );
}
