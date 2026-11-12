// Grade alerts: what in the student's requirement rules, results and calendar says "your grade is
// about to move". One pure function, used by the bell and (later) the server's mails.
//
// Four kinds (docs/superpowers/specs/2026-10-22-grade-alerts-design.md):
//   opportunity  a better grade is within reach on an upcoming assessment
//   risk         passing is gone, hard to reach, or a condition failed / only a retake can fix it
//   absence      the absence limit is close or crossed
//   change       a result recorded within CHANGE_DAYS settled or moved a grade
//
// "Never early in the term": an unrecorded future is always possible under the best case, so
// "unreachable" is only reported once the course has a recorded result, and "hard"/"opportunity"
// only for an assessment that is linked to the calendar and upcoming (`upcomingAssessments`).

import { getMessages, type Locale } from "@/lib/i18n";
import { DEFAULT_ALERT_KINDS } from "@/lib/alertPrefs";
import { catchUpGroupKey, linkedInstances, upcomingAssessments, type CatchUpInput, type UpcomingAssessment } from "@/lib/catchup";
import { evaluate, type Evaluation, type OutcomeEval } from "@/lib/rules/engine";
import { solveFor } from "@/lib/rules/solve";
import type { RequirementResult, RequirementRules, Scale } from "@/lib/rules/types";
import type { AlertKind, AlertKinds } from "@/lib/types";

export type { AlertKind, AlertKinds } from "@/lib/types";
export { ALERT_KIND_LIST, DEFAULT_ALERT_KINDS } from "@/lib/alertPrefs";

/** How far ahead an assessment counts. */
export const LOOKAHEAD_DAYS = 14;
/** A better grade is "in reach" when the needed score is at most this share of the maximum. */
export const REACHABLE_SHARE = 0.8;
/** Passing is "hard" when it needs at least this share of the maximum. */
export const HARD_SHARE = 0.7;
/** A recorded result keeps its "settled / changed" alert for this long. */
export const CHANGE_DAYS = 7;
/** An alert hinging on an assessment this close is urgent. */
export const URGENT_DAYS = 2;
/** The lowest passing grade. */
export const PASS_GRADE = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AlertSeverity = "info" | "warning" | "danger";

export interface GradeAlert {
  /** Stable for the same situation; changes when the situation does (another grade, level or assessment). */
  key: string;
  kind: AlertKind;
  severity: AlertSeverity;
  courseId: string;
  text: string;
  /** ISO start of the assessment the alert hinges on. */
  due?: string;
  /** Danger, or hinging on an assessment within `URGENT_DAYS`. */
  urgent: boolean;
}

export type GradeAlertInput = CatchUpInput;

const SEVERITY_ORDER: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Keeps the alerts of the kinds switched on. Without kinds, everything. */
export function filterAlerts(alerts: GradeAlert[], kinds: AlertKinds | undefined = DEFAULT_ALERT_KINDS): GradeAlert[] {
  return alerts.filter((a) => kinds[a.kind] !== false);
}

/** Danger, warning, info; then the assessment date (dated first); then the key, so the order is stable. */
export function compareAlerts(a: GradeAlert, b: GradeAlert): number {
  if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return a.key.localeCompare(b.key);
}

/** The scale of an assessment: the exam's own, or the first target exam's for a retake slot. */
function scaleOf(rules: RequirementRules, a: UpcomingAssessment): Scale | null {
  const target = a.target;
  if (target.kind === "exam") return target.scale;
  if (target.kind === "retake") {
    const first = rules.components.find((c) => c.id === target.targets[0]);
    return first?.kind === "exam" ? first.scale : null;
  }
  return null;
}

const maxOf = (scale: Scale): number => (scale.kind === "points" ? scale.max : 5);

/** Offered grades (megajanlott) are good news, never a failure: no risk alerts for them. */
const isRiskOutcome = (o: OutcomeEval): boolean => o.kind !== "megajanlott";

function isUrgent(severity: AlertSeverity, due: string | undefined, now: Date): boolean {
  if (severity === "danger") return true;
  const at = due ? Date.parse(due) : NaN;
  return Number.isFinite(at) && at - now.getTime() <= URGENT_DAYS * DAY_MS;
}

type AssessmentAlert = Omit<GradeAlert, "urgent" | "courseId">;

/**
 * What an upcoming assessment means for the grade: the best grade above a pass it can still bring
 * within `REACHABLE_SHARE` (opportunity), and a pass that needs at least `HARD_SHARE` (risk). Shared
 * by the alerts and the calendar export's event descriptions.
 */
function assessmentAlerts(
  rules: RequirementRules,
  results: RequirementResult[],
  ev: Evaluation,
  assessments: UpcomingAssessment[],
  now: Date,
  locale: Locale
): { assessment: UpcomingAssessment; alert: AssessmentAlert & { courseId: string } }[] {
  const t = getMessages(locale).gradeAlerts.text;
  const courseId = rules.courseId;
  // With several outcomes a text must say which one it is about.
  const named = (o: OutcomeEval, text: string) => (rules.outcomes.length > 1 ? t.outcomePrefix(o.label, text) : text);
  const out: { assessment: UpcomingAssessment; alert: AssessmentAlert & { courseId: string } }[] = [];

  for (const a of assessments) {
    const scale = scaleOf(rules, a);
    if (!scale) continue;
    const max = maxOf(scale);
    const due = a.instance.at ? { due: a.instance.at } : {};

    let found: { outcome: OutcomeEval; goal: number; min: number } | null = null;
    for (const outcome of ev.outcomes) {
      if (outcome.status === "final") continue;
      // Passing itself (a 2) is the risk kind's business; here only grades above it.
      for (let goal = outcome.best; goal > Math.max(outcome.worst, PASS_GRADE); goal--) {
        const r = solveFor(rules, results, now, { outcomeId: outcome.outcomeId, goal, target: a.target.id, others: "worst" }, locale);
        if (r.status !== "reachable" || r.viaRetake || r.min === undefined || r.min <= 0) continue;
        if (r.min <= REACHABLE_SHARE * max + 1e-9) {
          if (!found || goal > found.goal) found = { outcome, goal, min: r.min };
          break;
        }
      }
    }
    if (found) {
      const text =
        scale.kind === "points"
          ? t.opportunityPoints(a.target.label, found.min, max, found.goal)
          : t.opportunityGrade(a.target.label, found.min, found.goal);
      out.push({
        assessment: a,
        alert: {
          key: `opportunity:${courseId}:${a.target.id}:${a.instance.key}:${found.outcome.outcomeId}:${found.goal}`,
          kind: "opportunity",
          severity: "info",
          courseId,
          text: named(found.outcome, text),
          ...due,
        },
      });
    }

    // Passing still possible but demanding on this assessment.
    for (const outcome of ev.outcomes) {
      if (!isRiskOutcome(outcome) || outcome.worst >= PASS_GRADE || outcome.best < PASS_GRADE) continue;
      const r = solveFor(rules, results, now, { outcomeId: outcome.outcomeId, goal: PASS_GRADE, target: a.target.id, others: "worst" }, locale);
      if (r.status !== "reachable" || r.viaRetake || r.min === undefined || r.min < HARD_SHARE * max - 1e-9) continue;
      const text =
        scale.kind === "points"
          ? t.hardPoints(a.target.label, r.min, max, PASS_GRADE)
          : t.hardGrade(a.target.label, r.min, PASS_GRADE);
      out.push({
        assessment: a,
        alert: {
          key: `risk:hard:${courseId}:${a.target.id}:${a.instance.key}:${outcome.outcomeId}`,
          kind: "risk",
          severity: "warning",
          courseId,
          text: named(outcome, text),
          ...due,
        },
      });
    }
  }
  return out;
}

/**
 * Grade notes for upcoming assessments within `days`, keyed by the catch-up group key of the class
 * or deadline they belong to (`catchUpGroupKey`): the calendar export writes them into the event.
 */
export function assessmentNotes(input: GradeAlertInput, days: number, locale: Locale = "hu"): Map<string, string[]> {
  const { now } = input;
  const courseIds = new Set(input.courses.map((c) => c.id));
  const linked = linkedInstances(input);
  const upcoming = upcomingAssessments(input, linked, days, true);
  const notes = new Map<string, string[]>();
  for (const rules of input.rules) {
    if (!courseIds.has(rules.courseId) || rules.outcomes.length === 0) continue;
    const own = upcoming.filter((a) => a.courseId === rules.courseId);
    if (own.length === 0) continue;
    const results = input.results.filter((r) => r.courseId === rules.courseId);
    const ev = evaluate(rules, results, now, locale);
    for (const { assessment, alert } of assessmentAlerts(rules, results, ev, own, now, locale)) {
      const key = catchUpGroupKey(assessment);
      notes.set(key, [...(notes.get(key) ?? []), alert.text]);
    }
  }
  return notes;
}

export function gradeAlerts(input: GradeAlertInput, locale: Locale = "hu"): GradeAlert[] {
  const t = getMessages(locale).gradeAlerts.text;
  const standing = getMessages(locale).rules.standing;
  const { now } = input;
  const courseIds = new Set(input.courses.map((c) => c.id));
  const linked = linkedInstances(input);
  const upcoming = upcomingAssessments(input, linked, LOOKAHEAD_DAYS, true);
  const out: GradeAlert[] = [];

  const push = (a: Omit<GradeAlert, "urgent">) => out.push({ ...a, urgent: isUrgent(a.severity, a.due, now) });

  for (const rules of input.rules) {
    if (!courseIds.has(rules.courseId) || rules.outcomes.length === 0) continue;
    const courseId = rules.courseId;
    const results = input.results.filter((r) => r.courseId === courseId);
    const hasData = results.some((r) => r.state === "recorded");
    const ev = evaluate(rules, results, now, locale);
    const own = upcoming.filter((a) => a.courseId === courseId);
    // With several outcomes a text must say which one it is about.
    const named = (o: OutcomeEval, text: string) => (rules.outcomes.length > 1 ? t.outcomePrefix(o.label, text) : text);

    // ---- 1. opportunity, and 2a. passing is hard on an upcoming assessment ----
    for (const { alert } of assessmentAlerts(rules, results, ev, own, now, locale)) push(alert);

    // ---- 2. risk ----
    for (const outcome of ev.outcomes) {
      if (!isRiskOutcome(outcome)) continue;
      // Failed conditions (danger) and ones only a retake can still fix (warning).
      let failedGate = false;
      const seen = new Set<string>();
      for (const g of outcome.gates) {
        if (seen.has(g.id) || !hasData) continue;
        seen.add(g.id);
        if (g.status !== "failed" && g.status !== "fixable") continue;
        if (g.status === "failed") failedGate = true;
        push({
          key: `risk:gate:${courseId}:${outcome.outcomeId}:${g.id}`,
          kind: "risk",
          severity: g.status === "failed" ? "danger" : "warning",
          courseId,
          text: named(outcome, g.status === "failed" ? standing.notMet(g.label) : standing.mustFix(g.label)),
        });
      }
      // Passing is out of reach even in the best case (the failed condition above says why, if one does).
      if (hasData && !failedGate && outcome.best < PASS_GRADE) {
        push({
          key: `risk:unreachable:${courseId}:${outcome.outcomeId}`,
          kind: "risk",
          severity: "danger",
          courseId,
          text: t.unreachable(outcome.label),
        });
      }
    }

    // ---- 3. absence ----
    for (const c of ev.components) {
      if (c.kind !== "attendance" || c.maxTotal === undefined || c.points === undefined || c.points <= 0) continue;
      const left = c.maxTotal - c.points;
      if (left > 1) continue;
      const level = left < 0 ? "over" : left === 0 ? "none" : "one";
      push({
        key: `absence:${courseId}:${c.id}:${level}`,
        kind: "absence",
        severity: left <= 0 ? "danger" : "warning",
        courseId,
        text: level === "over" ? standing.overLimit : level === "none" ? standing.noneLeft : standing.oneLeft,
      });
    }

    // ---- 4. change: with versus without the results recorded within CHANGE_DAYS ----
    for (const alert of changeAlerts(rules, results, ev, now, locale)) push({ ...alert, courseId });
  }

  return out.sort(compareAlerts);
}

function changeAlerts(
  rules: RequirementRules,
  results: RequirementResult[],
  ev: Evaluation,
  now: Date,
  locale: Locale
): Omit<GradeAlert, "urgent" | "courseId">[] {
  const t = getMessages(locale).gradeAlerts.text;
  const cutoff = now.getTime() - CHANGE_DAYS * DAY_MS;
  const isRecent = (r: RequirementResult) => {
    const at = r.updatedAt ? Date.parse(r.updatedAt) : NaN;
    return Number.isFinite(at) && at >= cutoff;
  };
  if (!results.some(isRecent)) return [];
  const before = evaluate(rules, results.filter((r) => !isRecent(r)), now, locale);
  const out: Omit<GradeAlert, "urgent" | "courseId">[] = [];
  for (const now_ of ev.outcomes) {
    const old = before.outcomes.find((o) => o.outcomeId === now_.outcomeId);
    if (!old) continue;
    const named = (text: string) => (rules.outcomes.length > 1 ? t.outcomePrefix(now_.label, text) : text);
    const key = (what: string, grade: number) => `change:${what}:${rules.courseId}:${now_.outcomeId}:${grade}`;
    if (now_.status === "final" && old.status !== "final") {
      out.push({
        key: key("final", now_.worst),
        kind: "change",
        severity: now_.worst < PASS_GRADE ? "warning" : "info",
        text: named(t.settled(now_.worst)),
      });
      continue;
    }
    if (now_.worst > old.worst && now_.worst > 0) {
      out.push({ key: key("secured", now_.worst), kind: "change", severity: "info", text: named(t.secured(now_.worst)) });
    }
    if (now_.best < old.best && now_.best > 0) {
      out.push({ key: key("lost", now_.best), kind: "change", severity: "warning", text: named(t.lost(old.best)) });
    }
  }
  return out;
}
