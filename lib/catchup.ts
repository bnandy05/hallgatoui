// What the student still has to record, derived from data alone: a linked instance whose class
// or deadline is over, that is on or after the link's `since`, and that has no result yet. There
// is no "last visit" time; answering on one device resolves it everywhere through sync. The only
// stored time is the account-level `catchUp.promptedUntil`, which decides whether the popup opens
// by itself. Pure, so the server's email digest uses the same functions.

import type { ClassSession, Course, Deadline, SemesterInfo } from "@/lib/types";
import { deadlineIdentity } from "@/lib/ical/dedupe";
import { resolveInstances, type Instance } from "@/lib/rules/instances";
import { linkTargets, type ComponentLink, type LinkTarget } from "@/lib/rules/links";
import type { RequirementResult, RequirementRules, Scale } from "@/lib/rules/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A "Még nincs eredmény" item counts as late after this many days. */
export const RESULT_EXPECTED_DAYS = 14;

export interface CatchUpInput {
  courses: Course[];
  rules: RequirementRules[];
  results: RequirementResult[];
  sessions: ClassSession[]; // visibleSessions
  deadlines: Deadline[];
  semester?: SemesterInfo;
  now: Date;
}

export interface LinkedInstance {
  courseId: string;
  target: LinkTarget;
  link: ComponentLink;
  instance: Instance;
  /** The scale a retake slot inherits from its first target exam. */
  scale?: Scale;
}

function retakeScale(rules: RequirementRules, target: LinkTarget): Scale | undefined {
  if (target.kind !== "retake") return undefined;
  const first = rules.components.find((c) => c.id === target.targets[0]);
  return first?.kind === "exam" ? first.scale : undefined;
}

/** Every instance of every linked component of every course that has rules. */
export function linkedInstances(input: Omit<CatchUpInput, "now">): LinkedInstance[] {
  const courseIds = new Set(input.courses.map((c) => c.id));
  const out: LinkedInstance[] = [];
  for (const rules of input.rules) {
    if (!courseIds.has(rules.courseId) || !rules.calendarLinks) continue;
    const ctx = {
      courseId: rules.courseId,
      sessions: input.sessions,
      deadlines: input.deadlines,
      semester: input.semester,
      results: input.results,
    };
    for (const target of linkTargets(rules)) {
      const link = rules.calendarLinks[target.id];
      if (!link) continue;
      const scale = retakeScale(rules, target);
      if (target.kind === "retake" && !scale) continue;
      for (const instance of resolveInstances(target, link, ctx)) {
        out.push({ courseId: rules.courseId, target, link, instance, ...(scale && { scale }) });
      }
    }
  }
  return out;
}

export interface CatchUpField {
  courseId: string;
  target: LinkTarget;
  instance: Instance;
  scale?: Scale;
}

/** Fields whose result can come later ("Még nincs eredmény"); attendance and +/- are known at the class. */
export function canAwait(f: Pick<CatchUpField, "target">): boolean {
  return f.target.kind !== "attendance" && !(f.target.kind === "series" && f.target.scoring.kind === "plusMinus");
}

/** One slip of the catch-up: a class (attendance + röpzh together), a deadline, or one exam. */
export interface CatchUpGroup {
  key: string;
  courseId: string;
  at?: string;
  end: string;
  week?: number;
  session?: ClassSession;
  deadline?: Deadline;
  fields: CatchUpField[];
}

function groupKey(li: LinkedInstance): string {
  const { instance } = li;
  if (instance.session) return `${li.courseId}|s:${instance.session.externalUid}`;
  if (instance.deadline) return `${li.courseId}|d:${deadlineIdentity(instance.deadline)}`;
  return `${li.courseId}|${li.target.id}|${instance.key}`;
}

/** Whether a linked instance is over, tracked and still has nothing recorded. */
export function needsInput(li: LinkedInstance, now: Date): boolean {
  const { instance } = li;
  return instance.tracked && !instance.pinned && !instance.result && !!instance.end && Date.parse(instance.end) <= now.getTime();
}

/** Ended, tracked instances without a result, grouped by class or deadline, oldest first. */
export function pendingInputs(input: CatchUpInput, linked = linkedInstances(input)): CatchUpGroup[] {
  const groups = new Map<string, CatchUpGroup>();
  for (const li of linked) {
    if (!needsInput(li, input.now)) continue;
    const key = groupKey(li);
    let group = groups.get(key);
    if (!group) {
      const { instance } = li;
      group = {
        key,
        courseId: li.courseId,
        end: instance.end!,
        fields: [],
        ...(instance.at && { at: instance.at }),
        ...(instance.week !== undefined && { week: instance.week }),
        ...(instance.session && { session: instance.session }),
        ...(instance.deadline && { deadline: instance.deadline }),
      };
      groups.set(key, group);
    }
    group.fields.push({ courseId: li.courseId, target: li.target, instance: li.instance, ...(li.scale && { scale: li.scale }) });
  }
  return [...groups.values()].sort((a, b) => a.end.localeCompare(b.end) || a.key.localeCompare(b.key));
}

export interface AwaitingItem {
  result: RequirementResult;
  courseId: string;
  componentLabel: string;
  overdue: boolean;
}

/** Results marked "Még nincs eredmény", with `overdue` once they waited too long. */
export function awaitingResults(input: Pick<CatchUpInput, "courses" | "rules" | "results" | "now">): AwaitingItem[] {
  const courseIds = new Set(input.courses.map((c) => c.id));
  const rulesByCourse = new Map(input.rules.map((r) => [r.courseId, r]));
  const out: AwaitingItem[] = [];
  for (const result of input.results) {
    if (result.state !== "pending" || !courseIds.has(result.courseId)) continue;
    const rules = rulesByCourse.get(result.courseId);
    const target = rules ? linkTargets(rules).find((t) => t.id === result.componentId) : undefined;
    if (!target) continue;
    const since = result.at ? Date.parse(result.at) : NaN;
    out.push({
      result,
      courseId: result.courseId,
      componentLabel: target.label,
      overdue: Number.isFinite(since) && input.now.getTime() - since > RESULT_EXPECTED_DAYS * DAY_MS,
    });
  }
  return out.sort((a, b) => (a.result.at ?? "").localeCompare(b.result.at ?? ""));
}

export interface UpcomingAssessment {
  courseId: string;
  target: LinkTarget;
  instance: Instance;
}

/**
 * Exams and retakes known from the rules within the next `days` days, without a result. Deadline-
 * linked ones are left out: they already show as deadlines.
 */
export function upcomingAssessments(input: CatchUpInput, linked = linkedInstances(input), days = 14): UpcomingAssessment[] {
  const nowMs = input.now.getTime();
  const until = nowMs + days * DAY_MS;
  return linked
    .filter((li) => {
      if (li.target.kind !== "exam" && li.target.kind !== "retake") return false;
      if (li.link.mode === "deadlines" || li.instance.result || li.instance.pinned) return false;
      const at = li.instance.at ? Date.parse(li.instance.at) : NaN;
      const end = li.instance.end ? Date.parse(li.instance.end) : at;
      return Number.isFinite(at) && end >= nowMs && at <= until;
    })
    .map(({ courseId, target, instance }) => ({ courseId, target, instance }))
    .sort((a, b) => (a.instance.at ?? "").localeCompare(b.instance.at ?? ""));
}

/** Open the popup by itself only when something ended after it was last closed. */
export function shouldPrompt(groups: CatchUpGroup[], promptedUntil: string | undefined): boolean {
  if (groups.length === 0) return false;
  if (!promptedUntil) return true;
  const until = Date.parse(promptedUntil);
  return !Number.isFinite(until) || groups.some((g) => Date.parse(g.end) > until);
}
