// Declarative course requirements ("követelményrendszer") and the student's recorded results.
// Rules are data: expressions are short formula strings parsed by lib/rules/expr.ts, so the stored
// form stays flat (no recursion) and one schema serves the editor, sync and validation.
// The plan behind this is in the project folder plans/requirements-tracker/ (schema.md).

import type { ComponentLink } from "./links";

export type Formula = string;

/** A sub-score of an exam or a series item, e.g. "Elmélet" 2 + "Gyakorlat" 2 points. */
export interface Part {
  id: string;
  label: string;
  max: number;
  passAt?: number;
}

export type Scale =
  | { kind: "points"; max: number; step?: number; passAt?: number; parts?: Part[] }
  | { kind: "grade"; passAt?: number }; // 1–5, passAt defaults to 2

interface ComponentBase {
  id: string; // ASCII [a-z][a-z0-9_]*, usable as a formula identifier
  label: string;
  note?: string;
}

export interface AttendanceComponent extends ComponentBase {
  kind: "attendance";
  // The engine adds the limit as a gate to every "gyakorlat" outcome.
  limit?: { maxAbsences: number; countExcused: boolean; onExceed: "none" | "fail" };
}

export interface ExamComponent extends ComponentBase {
  kind: "exam";
  scale: Scale;
  due?: string;
}

export interface AssignmentOutcome {
  id: string;
  label: string;
  points: number;
  accepted: boolean;
}

export interface AssignmentComponent extends ComponentBase {
  kind: "assignment";
  due?: string;
  outcomes: AssignmentOutcome[]; // ordered best → worst
}

export type SeriesScoring =
  | { kind: "points"; max: number; step?: number; parts?: Part[] }
  | { kind: "plusMinus" }
  | { kind: "percent"; passAt: number; attempts?: number; onTimeOnly: boolean };

/** Repeated small items: röpzh (points or +/−) or online quizzes. */
export interface SeriesComponent extends ComponentBase {
  kind: "series";
  item: "ropzh" | "quiz";
  count: number;
  scoring: SeriesScoring;
}

export interface BonusComponent extends ComponentBase {
  kind: "bonus";
  cap?: number;
  closesAt?: string; // after this, no more bonus can come in
}

export type RuleComponent =
  | AttendanceComponent
  | ExamComponent
  | AssignmentComponent
  | SeriesComponent
  | BonusComponent;

export type ComponentKind = RuleComponent["kind"];

/** A pót/javító slot that can replace one of its target exams. */
export interface RetakeSlot {
  id: string;
  label: string;
  targets: string[]; // exam ids sharing one scale; the slot inherits it
  pick: "worse" | "failed" | "choose"; // which target it replaces ("choose": the result's retakeOf)
  mode: "replace" | "ifBetter"; // replace = even if lower
  eligible?: Formula; // default "1"; evaluated on raw (pre-retake) values
  due?: string;
}

export interface Derived {
  id: string;
  label: string;
  expr: Formula;
}

export interface TableRow {
  min: number;
  value: number;
}

/** Threshold table: the value of the last row whose min ≤ x (rows sorted by min ascending). */
export interface GradeTable {
  id: string;
  rows: TableRow[];
}

export interface Gate {
  id: string;
  label: string;
  test: Formula;
  onFail: "none" | "fail"; // none = no grade at all, fail = grade 1
}

export type PostStep =
  | { kind: "cap"; max: number }
  | { kind: "add"; when: Formula; delta: number; label: string };

export interface GradePath {
  id: string;
  label: string;
  when?: Formula; // the path applies when true (default "1")
  gates?: Gate[];
  grade: Formula; // floored, then post steps in order, then clamped to 1..5
  post?: PostStep[];
}

export interface Outcome {
  id: string;
  label: string;
  kind: "gyakorlat" | "vizsga" | "megajanlott";
  gates?: Gate[]; // common to all paths, checked first
  select: "first" | "best"; // first applicable path, or the best applicable one
  paths: GradePath[];
}

/** An assumption the user should confirm ("Ellenőrizd"). */
export interface RuleFlag {
  field: string;
  message: string;
  resolved: boolean;
}

export interface SubjectRules {
  schemaVersion: 1;
  components: RuleComponent[];
  retakes: RetakeSlot[];
  derived: Derived[]; // in order; a formula may only use earlier ids
  tables: GradeTable[];
  outcomes: Outcome[]; // grade(id) may only reference an earlier outcome
  flags: RuleFlag[];
}

/** One course's rules as stored (synced) in AppData.requirementRules. */
export interface RequirementRules extends SubjectRules {
  id: string; // "rules:<courseId>"
  courseId: string;
  source: "manual" | "template" | "extracted";
  templateId?: string;
  /** The student's calendar links per component or retake id (lib/rules/links.ts). */
  calendarLinks?: Record<string, ComponentLink>;
  updatedAt?: string;
}

// ----- the student's data, kept separate from the rules -----

export type ResultValue =
  | { kind: "points"; points: number; parts?: Record<string, number> }
  | { kind: "grade"; grade: 1 | 2 | 3 | 4 | 5 }
  | { kind: "pm"; sign: "+" | "-" }
  | { kind: "attendance"; status: "present" | "excused" | "unexcused" }
  | { kind: "assignment"; outcome: string } // AssignmentOutcome.id
  | { kind: "quiz"; bestPercent: number; onTime: boolean; attemptsUsed?: number }
  | { kind: "bonus"; points: number; note?: string };

/**
 * One recorded datum (synced in AppData.requirementResults). The id is deterministic
 * (`<courseId>|<componentId>|<instanceKey>`) so two devices entering the same item merge
 * field by field. instanceKey is "n:<1..N>" for manual entries (series item, session, bonus
 * entry) and "n:1" for single-instance components; later milestones add session keys
 * ("s:<uid>"), week keys ("w:<n>") and deadline keys ("d:<identity>").
 */
export interface RequirementResult {
  id: string;
  courseId: string;
  componentId: string; // component or retake slot id
  instanceKey: string;
  state: "recorded" | "pending" | "na"; // pending = "még nincs eredmény"; na = elmaradt / nem releváns
  value?: ResultValue; // when recorded
  retakeOf?: string; // for a retake slot with pick "choose"
  at?: string; // ISO, when it happened
  label?: string; // snapshot shown when the instance can't be resolved any more
  updatedAt?: string;
}

export function resultId(courseId: string, componentId: string, instanceKey: string): string {
  return `${courseId}|${componentId}|${instanceKey}`;
}

/** The sort position of an instance key: "n:<i>" by number, everything else after, by text. */
export function instanceOrder(a: RequirementResult, b: RequirementResult): number {
  const na = /^n:(\d+)$/.exec(a.instanceKey);
  const nb = /^n:(\d+)$/.exec(b.instanceKey);
  if (na && nb) return Number(na[1]) - Number(nb[1]);
  if (na) return -1;
  if (nb) return 1;
  return (a.at ?? a.instanceKey).localeCompare(b.at ?? b.instanceKey);
}
