// The grade engine: evaluates validated SubjectRules against the student's recorded results.
// Pure. Unknown inputs are filled with their best or worst value (corner evaluation, exact for
// monotone rules), untaken retakes are enumerated as choice vectors, and every outcome gets a
// best and a worst grade, a status (final / provisional / open) and gate statuses. Design in the
// project folder plans/requirements-tracker/schema.md §4.

import { EPS, evalAst, parseFormula, collectRefs, type Ast, type FormulaEnv, type Pred } from "./expr";
import {
  instanceOrder,
  type AssignmentComponent,
  type AssignmentOutcome,
  type AttendanceComponent,
  type BonusComponent,
  type ComponentKind,
  type ExamComponent,
  type Gate,
  type GradePath,
  type Outcome,
  type RequirementResult,
  type RetakeSlot,
  type RuleComponent,
  type Scale,
  type SeriesComponent,
  type SubjectRules,
} from "./types";

export type GradeValue = 0 | 1 | 2 | 3 | 4 | 5; // 0 = no grade
export type GateStatus = "met" | "failed" | "fixable" | "open";

export interface GateEval {
  id: string;
  label: string;
  status: GateStatus;
  pathId?: string; // set for a path's own gates
}

export interface OutcomeEval {
  outcomeId: string;
  label: string;
  kind: Outcome["kind"];
  status: "final" | "provisional" | "open";
  current: GradeValue | null; // the grade with the known data and no new retakes; null while open
  best: GradeValue;
  worst: GradeValue;
  path: string; // the path giving `current` (or the worst case); "" when none applied
  gates: GateEval[];
  applied: string[]; // labels of the post steps that fired
}

export interface ComponentEval {
  id: string;
  kind: ComponentKind | "retake";
  label: string;
  recorded: number;
  total: number;
  pending: number;
  na: number;
  points?: number; // recorded so far (exam: raw value; series: sum; attendance: counted absences)
  maxSoFar?: number; // the most the recorded items could have given
  maxTotal?: number;
  status: "passed" | "failed" | "open" | "done" | "na";
  effective?: number; // exam value after recorded retakes
  replacedBy?: string; // retake slot that replaced this exam
  replaces?: string; // for a retake slot: the exam it replaced
  overdueEntry: boolean; // due < now and nothing recorded
}

export interface Evaluation {
  outcomes: OutcomeEval[];
  components: ComponentEval[];
  derived: Record<string, { best: number; worst: number }>;
  warnings: string[];
}

// ----- model: the rules joined with the results -----

type Policy = "best" | "worst";
type SlotState = "known" | "unknown" | "na";

export interface ExamVal {
  value: number;
  parts: Record<string, number> | null;
  na: boolean;
}

interface SeriesItem {
  value: number;
  parts: Record<string, number> | null;
  passed: boolean;
  plus: boolean;
}

interface ExamData {
  comp: ExamComponent;
  state: SlotState;
  pending: boolean;
  val: ExamVal;
}
interface AssignmentData {
  comp: AssignmentComponent;
  state: SlotState;
  pending: boolean;
  outcome?: AssignmentOutcome;
}
interface SeriesData {
  comp: SeriesComponent;
  items: SeriesItem[];
  unknown: number;
  na: number;
  pending: number;
}
interface AttendanceData {
  comp: AttendanceComponent;
  present: number;
  excused: number;
  unexcused: number;
}
interface BonusData {
  comp: BonusComponent;
  sum: number;
  entries: number;
  closed: boolean;
}
interface RetakeData {
  slot: RetakeSlot;
  scale: Scale | null;
  state: SlotState;
  pending: boolean;
  val: ExamVal;
  retakeOf?: string;
  eligible: Ast | null;
}

export interface Model {
  rules: SubjectRules;
  now: Date;
  comps: Map<string, RuleComponent>;
  exams: Map<string, ExamData>;
  assignments: Map<string, AssignmentData>;
  series: Map<string, SeriesData>;
  attendance: Map<string, AttendanceData>;
  bonus: Map<string, BonusData>;
  retakes: RetakeData[];
  derived: Map<string, Ast>;
  tables: Map<string, { min: number; value: number }[]>;
  alt: Set<string>; // exams read only by alternative paths (utóvizsga, szóbeli…)
  warnings: string[];
}

function ast(src: string | undefined, warnings: string[], where: string): Ast | null {
  if (src === undefined) return null;
  const r = parseFormula(src);
  if (r.ok) return r.ast;
  warnings.push(`${where}: hibás képlet (${r.error.message})`);
  return null;
}

function examValFromResult(scale: Scale, r: RequirementResult): ExamVal | null {
  const v = r.value;
  if (!v) return null;
  if (scale.kind === "grade") return v.kind === "grade" ? { value: v.grade, parts: null, na: false } : null;
  if (v.kind !== "points") return null;
  let parts: Record<string, number> | null = null;
  if (scale.parts && v.parts) {
    parts = {};
    for (const p of scale.parts) if (typeof v.parts[p.id] === "number") parts[p.id] = v.parts[p.id];
  }
  return { value: v.points, parts, na: false };
}

function corner(scale: Scale, policy: Policy): ExamVal {
  if (scale.kind === "grade") return { value: policy === "best" ? 5 : 1, parts: null, na: false };
  const parts = scale.parts ? Object.fromEntries(scale.parts.map((p) => [p.id, policy === "best" ? p.max : 0])) : null;
  return { value: policy === "best" ? scale.max : 0, parts, na: false };
}

/** A points value spread over the scale's parts in proportion to their maxima. */
function proportional(scale: Scale, v: number): ExamVal {
  if (scale.kind === "grade") return { value: v, parts: null, na: false };
  const parts = scale.parts ? Object.fromEntries(scale.parts.map((p) => [p.id, (v * p.max) / scale.max])) : null;
  return { value: v, parts, na: false };
}

export function examPassed(scale: Scale, ev: ExamVal): boolean {
  if (scale.kind === "grade") return ev.value >= (scale.passAt ?? 2) - EPS;
  if (scale.passAt !== undefined && ev.value < scale.passAt - EPS) return false;
  if (scale.parts && ev.parts) {
    for (const p of scale.parts) if (p.passAt !== undefined && (ev.parts[p.id] ?? 0) < p.passAt - EPS) return false;
  }
  return true;
}

const NA_VAL: ExamVal = { value: 0, parts: null, na: true };
const ZERO_VAL: ExamVal = { value: 0, parts: null, na: false };

function seriesItem(c: SeriesComponent, r: RequirementResult): SeriesItem | null {
  const v = r.value;
  if (!v) return null;
  const s = c.scoring;
  if (s.kind === "points" && v.kind === "points") {
    let parts: Record<string, number> | null = null;
    if (s.parts && v.parts) {
      parts = {};
      for (const p of s.parts) if (typeof v.parts[p.id] === "number") parts[p.id] = v.parts[p.id];
    }
    return { value: v.points, parts, passed: true, plus: true };
  }
  if (s.kind === "plusMinus" && v.kind === "pm") {
    const plus = v.sign === "+";
    return { value: plus ? 1 : 0, parts: null, passed: plus, plus };
  }
  if (s.kind === "percent" && v.kind === "quiz") {
    const passed = v.bestPercent >= s.passAt - EPS && (v.onTime || !s.onTimeOnly);
    return { value: passed ? 1 : 0, parts: null, passed, plus: passed };
  }
  return null;
}

function seriesCorner(c: SeriesComponent, policy: Policy): SeriesItem {
  const s = c.scoring;
  const good = policy === "best";
  if (s.kind === "points") {
    const parts = s.parts ? Object.fromEntries(s.parts.map((p) => [p.id, good ? p.max : 0])) : null;
    return { value: good ? s.max : 0, parts, passed: true, plus: true };
  }
  return { value: good ? 1 : 0, parts: null, passed: good, plus: good };
}

const MISMATCH = (label: string) => `${label}: az eredmény típusa nem illik az összetevőhöz, kihagyva`;

export function buildModel(rules: SubjectRules, results: RequirementResult[], now: Date): Model {
  const warnings: string[] = [];
  const comps = new Map(rules.components.map((c) => [c.id, c]));
  const slots = new Map(rules.retakes.map((r) => [r.id, r]));
  const byComp = new Map<string, RequirementResult[]>();
  for (const r of results) {
    if (!comps.has(r.componentId) && !slots.has(r.componentId)) {
      warnings.push(`Ismeretlen összetevő eredménye: „${r.label ?? r.componentId}” (${r.componentId}, ${r.instanceKey})`);
      continue;
    }
    const list = byComp.get(r.componentId) ?? [];
    list.push(r);
    byComp.set(r.componentId, list);
  }
  for (const list of byComp.values()) list.sort(instanceOrder);

  // A single-instance component uses its first result in instance order.
  const single = (id: string, label: string): RequirementResult | undefined => {
    const list = byComp.get(id);
    if (!list?.length) return undefined;
    if (list.length > 1) warnings.push(`${label}: több eredmény van rögzítve, az elsőt vesszük`);
    return list[0];
  };

  const m: Model = {
    rules,
    now,
    comps,
    exams: new Map(),
    assignments: new Map(),
    series: new Map(),
    attendance: new Map(),
    bonus: new Map(),
    retakes: [],
    derived: new Map(),
    tables: new Map(rules.tables.map((t) => [t.id, t.rows])),
    alt: new Set(),
    warnings,
  };

  for (const c of rules.components) {
    switch (c.kind) {
      case "exam": {
        const r = single(c.id, c.label);
        const d: ExamData = { comp: c, state: "unknown", pending: r?.state === "pending", val: ZERO_VAL };
        if (r?.state === "na") d.state = "na";
        else if (r?.state === "recorded") {
          const v = examValFromResult(c.scale, r);
          if (v) Object.assign(d, { state: "known", val: v });
          else warnings.push(MISMATCH(c.label));
        }
        m.exams.set(c.id, d);
        break;
      }
      case "assignment": {
        const r = single(c.id, c.label);
        const d: AssignmentData = { comp: c, state: "unknown", pending: r?.state === "pending" };
        if (r?.state === "na") d.state = "na";
        else if (r?.state === "recorded") {
          const o = r.value?.kind === "assignment" ? c.outcomes.find((x) => x.id === (r.value as { outcome: string }).outcome) : undefined;
          if (o) Object.assign(d, { state: "known", outcome: o });
          else warnings.push(MISMATCH(c.label));
        }
        m.assignments.set(c.id, d);
        break;
      }
      case "series": {
        const list = byComp.get(c.id) ?? [];
        if (list.length > c.count) warnings.push(`${c.label}: több eredmény van, mint tétel (${c.count}), a többlet kimarad`);
        const d: SeriesData = { comp: c, items: [], unknown: 0, na: 0, pending: 0 };
        for (const r of list.slice(0, c.count)) {
          if (r.state === "na") d.na++;
          else if (r.state === "pending") d.pending++;
          else {
            const it = seriesItem(c, r);
            if (it) d.items.push(it);
            else warnings.push(MISMATCH(c.label));
          }
        }
        d.unknown = Math.max(0, c.count - d.items.length - d.na);
        m.series.set(c.id, d);
        break;
      }
      case "attendance": {
        const d: AttendanceData = { comp: c, present: 0, excused: 0, unexcused: 0 };
        for (const r of byComp.get(c.id) ?? []) {
          if (r.state !== "recorded") continue;
          if (r.value?.kind !== "attendance") {
            warnings.push(MISMATCH(c.label));
            continue;
          }
          d[r.value.status === "present" ? "present" : r.value.status]++;
        }
        m.attendance.set(c.id, d);
        break;
      }
      case "bonus": {
        const d: BonusData = { comp: c, sum: 0, entries: 0, closed: c.closesAt !== undefined && Date.parse(c.closesAt) < now.getTime() };
        for (const r of byComp.get(c.id) ?? []) {
          if (r.state !== "recorded") continue;
          if (r.value?.kind !== "bonus" && r.value?.kind !== "points") {
            warnings.push(MISMATCH(c.label));
            continue;
          }
          d.sum += r.value.points;
          d.entries++;
        }
        m.bonus.set(c.id, d);
        break;
      }
    }
  }

  for (const slot of rules.retakes) {
    const first = comps.get(slot.targets[0]);
    const scale = first?.kind === "exam" ? first.scale : null;
    const r = single(slot.id, slot.label);
    const d: RetakeData = {
      slot,
      scale,
      state: "unknown",
      pending: r?.state === "pending",
      val: ZERO_VAL,
      eligible: ast(slot.eligible, warnings, slot.label),
    };
    if (r?.state === "na") d.state = "na";
    else if (r?.state === "recorded" && scale) {
      const v = examValFromResult(scale, r);
      if (!v) warnings.push(MISMATCH(slot.label));
      else if (slot.pick === "choose" && !(r.retakeOf && slot.targets.includes(r.retakeOf))) {
        warnings.push(`${slot.label}: nincs megadva, melyik zh-t váltja ki, kihagyva`);
      } else Object.assign(d, { state: "known", val: v, retakeOf: r.retakeOf });
    }
    m.retakes.push(d);
  }

  for (const dv of rules.derived) {
    const a = ast(dv.expr, warnings, dv.label);
    if (a) m.derived.set(dv.id, a);
  }
  m.alt = alternativeExams(rules, m.derived);
  return m;
}

/**
 * Exams read only by alternative paths: a non-final path of a "first" outcome, or any path of a
 * "best" outcome with several paths (an utóvizsga, an oral exam). Not having taken one yet does
 * not make the current grade unknown.
 */
function alternativeExams(rules: SubjectRules, derived: Map<string, Ast>): Set<string> {
  const regular = new Set<string>();
  const alt = new Set<string>();
  const expand = (src: string | undefined, into: Set<string>, seen = new Set<string>()) => {
    if (!src) return;
    const r = parseFormula(src);
    if (!r.ok) return;
    const walk = (a: Ast) => {
      for (const id of collectRefs(a)) {
        if (derived.has(id)) {
          if (!seen.has(id)) {
            seen.add(id);
            walk(derived.get(id)!);
          }
        } else into.add(id);
      }
    };
    walk(r.ast);
  };
  rules.retakes.forEach((r) => expand(r.eligible, regular));
  for (const o of rules.outcomes) {
    o.gates?.forEach((g) => expand(g.test, regular));
    o.paths.forEach((p, i) => {
      const isAlt = o.select === "first" ? i < o.paths.length - 1 : o.paths.length > 1;
      const into = isAlt ? alt : regular;
      expand(p.when, into);
      p.gates?.forEach((g) => expand(g.test, into));
      expand(p.grade, into);
      p.post?.forEach((s) => s.kind === "add" && expand(s.when, into));
    });
  }
  const out = new Set<string>();
  for (const id of alt) if (!regular.has(id) && rules.components.some((c) => c.id === id && c.kind === "exam")) out.add(id);
  return out;
}

// ----- one scenario: a fill policy, a retake choice vector, an optional solver override -----

export interface Scenario {
  regular: Policy;
  alt: Policy;
  /** Untaken retakes treated as taken: true, or the target exam for pick "choose". */
  choice: Map<string, true | string>;
  /** Solver: a forced value for an exam, a retake slot (forced taken) or a series' remaining points. */
  override?: { id: string; value: number; retakeTarget?: string };
}

interface Vals {
  raw: Map<string, ExamVal>;
  eff: Map<string, ExamVal>;
  replacedBy: Map<string, string>;
  taken: Set<string>;
  series: Map<string, SeriesItem[]>;
  assignment: Map<string, { points: number; accepted: boolean; na: boolean }>;
  bonus: Map<string, number>;
  notes: string[];
}

export interface OutcomeRun {
  grade: GradeValue;
  path: string;
  applied: string[];
  failedGate?: Gate;
  pathMax?: number; // the highest grade the chosen path can give (its caps), for the solver
}

export interface Run {
  vals: Vals;
  env: FormulaEnv;
  outcomes: Map<string, OutcomeRun>;
}

function fillValues(m: Model, sc: Scenario): Vals {
  const vals: Vals = {
    raw: new Map(),
    eff: new Map(),
    replacedBy: new Map(),
    taken: new Set(),
    series: new Map(),
    assignment: new Map(),
    bonus: new Map(),
    notes: [],
  };
  const ov = sc.override;
  for (const [id, d] of m.exams) {
    const policy = m.alt.has(id) ? sc.alt : sc.regular;
    let v: ExamVal;
    if (ov?.id === id) v = proportional(d.comp.scale, ov.value);
    else if (d.state === "known") v = d.val;
    else if (d.state === "na") v = NA_VAL;
    else v = corner(d.comp.scale, policy);
    vals.raw.set(id, v);
    vals.eff.set(id, v);
  }
  for (const [id, d] of m.assignments) {
    if (d.state === "na") vals.assignment.set(id, { points: 0, accepted: true, na: true });
    else {
      const outs = d.comp.outcomes;
      const o = d.state === "known" ? d.outcome! : sc.regular === "best" ? outs[0] : outs[outs.length - 1];
      vals.assignment.set(id, { points: o?.points ?? 0, accepted: o?.accepted ?? false, na: false });
    }
  }
  for (const [id, d] of m.series) {
    const items = d.items.slice();
    if (ov?.id === id && d.unknown > 0) {
      const s = d.comp.scoring;
      if (s.kind === "points") {
        const per = ov.value / d.unknown;
        const parts = s.parts ? Object.fromEntries(s.parts.map((p) => [p.id, (per * p.max) / s.max])) : null;
        for (let i = 0; i < d.unknown; i++) items.push({ value: per, parts, passed: true, plus: true });
      } else {
        for (let i = 0; i < d.unknown; i++) items.push(seriesCorner(d.comp, i < ov.value ? "best" : "worst"));
      }
    } else {
      const fill = seriesCorner(d.comp, sc.regular);
      for (let i = 0; i < d.unknown; i++) items.push(fill);
    }
    vals.series.set(id, items);
  }
  for (const [id, d] of m.bonus) {
    const cap = d.comp.cap;
    const known = cap === undefined ? d.sum : Math.min(d.sum, cap);
    vals.bonus.set(id, sc.regular === "best" && !d.closed && cap !== undefined ? Math.max(known, cap) : known);
  }
  applyRetakes(m, sc, vals);
  return vals;
}

function applyRetakes(m: Model, sc: Scenario, vals: Vals): void {
  for (const d of m.retakes) {
    if (!d.scale) continue;
    const slot = d.slot;
    const forced = sc.override?.id === slot.id;
    let val: ExamVal;
    let chosen: string | undefined;
    if (forced) {
      val = proportional(d.scale, sc.override!.value);
      chosen = sc.override!.retakeTarget;
    } else if (d.state === "known") {
      val = d.val;
      chosen = d.retakeOf;
    } else {
      const c = sc.choice.get(slot.id);
      if (c === undefined) continue;
      val = corner(d.scale, "best");
      if (typeof c === "string") chosen = c;
    }
    const recorded = d.state === "known" && !forced;
    const eligible = d.eligible ? Math.abs(evalAst(d.eligible, rawEnv(m, vals))) > EPS : true;
    if (!eligible) {
      if (!recorded) continue;
      vals.notes.push(`${slot.label}: a feltételek szerint nem lett volna megírható, mégis beszámítjuk`);
    }
    if (recorded) vals.taken.add(slot.id);
    const target = pickTarget(slot, d.scale, vals, chosen);
    if (!target) continue;
    vals.taken.add(slot.id);
    const cur = vals.eff.get(target)!;
    if (slot.mode === "replace" || val.value > cur.value + EPS) {
      vals.eff.set(target, val);
      vals.replacedBy.set(target, slot.id);
    }
  }
}

function pickTarget(slot: RetakeSlot, scale: Scale, vals: Vals, chosen: string | undefined): string | undefined {
  if (slot.pick === "choose") return chosen && slot.targets.includes(chosen) ? chosen : undefined;
  const live = slot.targets.filter((t) => vals.raw.has(t) && !vals.raw.get(t)!.na);
  if (slot.pick === "failed") return live.find((t) => !examPassed(scale, vals.raw.get(t)!));
  let worst: string | undefined;
  for (const t of live) if (worst === undefined || vals.raw.get(t)!.value <= vals.raw.get(worst)!.value + EPS) worst = t;
  return worst;
}

function tableLookup(rows: { min: number; value: number }[] | undefined, x: number): number {
  let v = 0;
  for (const r of rows ?? []) if (r.min <= x + EPS) v = r.value;
  return v;
}

function countPred(m: Model, vals: Vals, pred: Pred, id: string, raw: boolean): number {
  const c = m.comps.get(id);
  if (!c) return 0;
  switch (c.kind) {
    case "exam": {
      const v = (raw ? vals.raw : vals.eff).get(id)!;
      if (v.na) return 0;
      const passed = examPassed(c.scale, v);
      return pred === "passed" ? Number(passed) : pred === "failed" ? Number(!passed) : 0;
    }
    case "assignment": {
      const a = vals.assignment.get(id)!;
      if (a.na) return 0;
      return pred === "passed" ? Number(a.accepted) : pred === "failed" ? Number(!a.accepted) : 0;
    }
    case "series": {
      const items = vals.series.get(id)!;
      const f: Partial<Record<Pred, (i: SeriesItem) => boolean>> = {
        passed: (i) => i.passed,
        failed: (i) => !i.passed,
        plus: (i) => i.plus,
        minus: (i) => !i.plus,
      };
      const fn = f[pred];
      return fn ? items.filter(fn).length : 0;
    }
    case "attendance": {
      const a = m.attendance.get(id)!;
      return pred === "absent" ? a.excused + a.unexcused : pred === "excused" ? a.excused : pred === "unexcused" ? a.unexcused : 0;
    }
    default:
      return 0;
  }
}

function compValue(m: Model, vals: Vals, id: string, part: string | undefined, raw: boolean): number {
  const c = m.comps.get(id)!;
  switch (c.kind) {
    case "exam": {
      const v = (raw ? vals.raw : vals.eff).get(id)!;
      return part ? (v.parts?.[part] ?? 0) : v.value;
    }
    case "assignment":
      return vals.assignment.get(id)!.points;
    case "series":
      return vals.series.get(id)!.reduce((s, i) => s + (part ? (i.parts?.[part] ?? 0) : i.value), 0);
    case "attendance": {
      const a = m.attendance.get(id)!;
      return c.limit?.countExcused === false ? a.unexcused : a.excused + a.unexcused;
    }
    case "bonus":
      return vals.bonus.get(id)!;
  }
}

/** Env for retake eligibility: exams read their raw values. */
function rawEnv(m: Model, vals: Vals): FormulaEnv {
  return {
    ref: (id, part) => (m.comps.has(id) ? compValue(m, vals, id, part, true) : 0),
    raw: (id, part) => (m.comps.has(id) ? compValue(m, vals, id, part, true) : 0),
    count: (pred, ids) => ids.reduce((s, id) => s + countPred(m, vals, pred, id, true), 0),
    table: (id, x) => tableLookup(m.tables.get(id), x),
    grade: () => 0,
    taken: () => 0,
  };
}

export function runScenario(m: Model, sc: Scenario): Run {
  const vals = fillValues(m, sc);
  const derivedMemo = new Map<string, number>();
  const inProgress = new Set<string>();
  const outcomes = new Map<string, OutcomeRun>();
  const env: FormulaEnv = {
    ref(id, part) {
      if (m.comps.has(id)) return compValue(m, vals, id, part, false);
      const a = m.derived.get(id);
      if (!a || inProgress.has(id)) return 0;
      const hit = derivedMemo.get(id);
      if (hit !== undefined) return hit;
      inProgress.add(id);
      const v = evalAst(a, env);
      inProgress.delete(id);
      derivedMemo.set(id, v);
      return v;
    },
    raw: (id, part) => (m.comps.has(id) ? compValue(m, vals, id, part, true) : 0),
    count: (pred, ids, raw) => ids.reduce((s, id) => s + countPred(m, vals, pred, id, raw), 0),
    table: (id, x) => tableLookup(m.tables.get(id), x),
    grade: (id) => outcomes.get(id)?.grade ?? 0,
    taken: (id) => (vals.taken.has(id) ? 1 : 0),
  };
  for (const o of m.rules.outcomes) outcomes.set(o.id, runOutcome(m, o, env));
  return { vals, env, outcomes };
}

const test = (src: string | undefined, env: FormulaEnv, dflt = true): boolean => {
  if (src === undefined) return dflt;
  const r = parseFormula(src);
  return r.ok ? Math.abs(evalAst(r.ast, env)) > EPS : false;
};

/** The attendance limits as gates (added to every "gyakorlat" outcome). */
export function attendanceGates(rules: SubjectRules): Gate[] {
  const out: Gate[] = [];
  for (const c of rules.components) {
    if (c.kind !== "attendance" || !c.limit) continue;
    out.push({
      id: `@${c.id}`,
      label: `${c.label}: legfeljebb ${c.limit.maxAbsences} hiányzás`,
      test: `${c.id} <= ${c.limit.maxAbsences}`,
      onFail: c.limit.onExceed,
    });
  }
  return out;
}

export function outcomeGates(rules: SubjectRules, o: Outcome): Gate[] {
  return [...(o.kind === "gyakorlat" ? attendanceGates(rules) : []), ...(o.gates ?? [])];
}

const clampGrade = (g: number): GradeValue => Math.max(1, Math.min(5, Math.floor(g))) as GradeValue;

function runPath(p: GradePath, env: FormulaEnv): OutcomeRun {
  for (const g of p.gates ?? []) {
    if (!test(g.test, env)) return { grade: g.onFail === "fail" ? 1 : 0, path: p.id, applied: [], failedGate: g };
  }
  const r = parseFormula(p.grade);
  let g = r.ok ? Math.floor(evalAst(r.ast, env) + EPS) : 0;
  const applied: string[] = [];
  let pathMax = 5;
  for (const s of p.post ?? []) {
    if (s.kind === "cap") {
      pathMax = Math.min(pathMax, s.max);
      g = Math.min(g, s.max);
    } else if (test(s.when, env, false)) {
      g += s.delta;
      applied.push(s.label);
    }
  }
  if (r.ok && r.ast.k === "num") pathMax = Math.min(pathMax, r.ast.v);
  return { grade: clampGrade(g), path: p.id, applied, pathMax };
}

function runOutcome(m: Model, o: Outcome, env: FormulaEnv): OutcomeRun {
  const applicable = o.paths.filter((p) => test(p.when, env));
  for (const g of outcomeGates(m.rules, o)) {
    if (!test(g.test, env)) return { grade: g.onFail === "fail" ? 1 : 0, path: applicable[0]?.id ?? "", applied: [], failedGate: g };
  }
  if (!applicable.length) return { grade: 0, path: "", applied: [] };
  if (o.select === "first") return runPath(applicable[0], env);
  let best: OutcomeRun | undefined;
  for (const p of applicable) {
    const r = runPath(p, env);
    if (!best || r.grade > best.grade) best = r;
  }
  return best!;
}

// ----- choice vectors -----

const MAX_VECTORS = 1024;

/** Every combination of the untaken retakes (not taken / taken, per target for "choose"). */
export function choiceVectors(m: Model, exclude?: string): Map<string, true | string>[] {
  const opts: { id: string; options: (true | string)[] }[] = [];
  for (const d of m.retakes) {
    if (d.state !== "unknown" || !d.scale || d.slot.id === exclude) continue;
    opts.push({ id: d.slot.id, options: d.slot.pick === "choose" ? d.slot.targets.slice() : [true] });
  }
  const total = opts.reduce((n, o) => n * (o.options.length + 1), 1);
  if (total > MAX_VECTORS) {
    // Too many: each retake alone, plus all of them at once.
    const out: Map<string, true | string>[] = [new Map()];
    for (const o of opts) for (const v of o.options) out.push(new Map([[o.id, v]]));
    out.push(new Map(opts.map((o) => [o.id, o.options[0]])));
    return out;
  }
  let out: Map<string, true | string>[] = [new Map()];
  for (const o of opts) {
    const next: Map<string, true | string>[] = [];
    for (const base of out) {
      next.push(base);
      for (const v of o.options) next.push(new Map([...base, [o.id, v]]));
    }
    out = next;
  }
  return out;
}

// ----- evaluate -----

function gateTrue(g: Gate, run: Run): boolean {
  return test(g.test, run.env);
}

export function evaluate(rules: SubjectRules, results: RequirementResult[], now: Date): Evaluation {
  const m = buildModel(rules, results, now);
  const none = new Map<string, true | string>();
  const worstRun = runScenario(m, { regular: "worst", alt: "worst", choice: none });
  const regBestRun = runScenario(m, { regular: "best", alt: "worst", choice: none });
  const bestRuns = choiceVectors(m).map((choice) => runScenario(m, { regular: "best", alt: "best", choice }));

  const outcomes: OutcomeEval[] = rules.outcomes.map((o) => {
    const w = worstRun.outcomes.get(o.id)!;
    const worst = w.grade;
    const best = Math.max(worst, ...bestRuns.map((r) => r.outcomes.get(o.id)!.grade)) as GradeValue;
    const determined = regBestRun.outcomes.get(o.id)!.grade === worst;
    const current = determined ? worst : null;
    const status = best === worst ? "final" : determined ? "provisional" : "open";

    const pathId = w.path || bestRuns[0].outcomes.get(o.id)!.path;
    const gateStatus = (g: Gate): GateStatus => {
      if (gateTrue(g, worstRun)) return "met";
      if (!bestRuns.some((r) => gateTrue(g, r))) return "failed";
      return gateTrue(g, regBestRun) ? "open" : "fixable";
    };
    const gates: GateEval[] = outcomeGates(rules, o).map((g) => ({ id: g.id, label: g.label, status: gateStatus(g) }));
    const path = o.paths.find((p) => p.id === pathId);
    for (const g of path?.gates ?? []) gates.push({ id: g.id, label: g.label, status: gateStatus(g), pathId: path!.id });

    return { outcomeId: o.id, label: o.label, kind: o.kind, status, current, best, worst, path: w.path, gates, applied: w.applied };
  });

  const derived: Record<string, { best: number; worst: number }> = {};
  for (const d of rules.derived) derived[d.id] = { best: bestRuns[0].env.ref(d.id), worst: worstRun.env.ref(d.id) };

  return {
    outcomes,
    components: componentEvals(m, worstRun),
    derived,
    warnings: [...m.warnings, ...worstRun.vals.notes],
  };
}

function componentEvals(m: Model, run: Run): ComponentEval[] {
  const now = m.now.getTime();
  const overdue = (due: string | undefined, state: SlotState) =>
    due !== undefined && Date.parse(due) < now && state === "unknown";
  const out: ComponentEval[] = [];
  for (const c of m.rules.components) {
    const base = { id: c.id, kind: c.kind, label: c.label };
    switch (c.kind) {
      case "exam": {
        const d = m.exams.get(c.id)!;
        const replacedBy = run.vals.replacedBy.get(c.id);
        const eff = run.vals.eff.get(c.id)!;
        const settled = d.state === "known" || replacedBy !== undefined;
        out.push({
          ...base,
          recorded: d.state === "known" ? 1 : 0,
          total: 1,
          pending: d.pending ? 1 : 0,
          na: d.state === "na" ? 1 : 0,
          points: d.state === "known" ? d.val.value : undefined,
          maxTotal: c.scale.kind === "points" ? c.scale.max : 5,
          status: d.state === "na" ? "na" : settled ? (examPassed(c.scale, eff) ? "passed" : "failed") : "open",
          effective: settled ? eff.value : undefined,
          replacedBy,
          overdueEntry: overdue(c.due, d.state),
        });
        break;
      }
      case "assignment": {
        const d = m.assignments.get(c.id)!;
        out.push({
          ...base,
          recorded: d.state === "known" ? 1 : 0,
          total: 1,
          pending: d.pending ? 1 : 0,
          na: d.state === "na" ? 1 : 0,
          points: d.outcome?.points,
          maxTotal: c.outcomes[0]?.points,
          status: d.state === "na" ? "na" : d.outcome ? (d.outcome.accepted ? "passed" : "failed") : "open",
          overdueEntry: overdue(c.due, d.state),
        });
        break;
      }
      case "series": {
        const d = m.series.get(c.id)!;
        const per = c.scoring.kind === "points" ? c.scoring.max : 1;
        out.push({
          ...base,
          recorded: d.items.length,
          total: c.count,
          pending: d.pending,
          na: d.na,
          points: d.items.reduce((s, i) => s + i.value, 0),
          maxSoFar: d.items.length * per,
          maxTotal: (c.count - d.na) * per,
          status: d.unknown === 0 ? "done" : "open",
          overdueEntry: false,
        });
        break;
      }
      case "attendance": {
        const d = m.attendance.get(c.id)!;
        const counted = compValue(m, run.vals, c.id, undefined, false);
        out.push({
          ...base,
          recorded: d.present + d.excused + d.unexcused,
          total: d.present + d.excused + d.unexcused,
          pending: 0,
          na: 0,
          points: counted,
          maxTotal: c.limit?.maxAbsences,
          status: c.limit && counted > c.limit.maxAbsences ? "failed" : "open",
          overdueEntry: false,
        });
        break;
      }
      case "bonus": {
        const d = m.bonus.get(c.id)!;
        out.push({
          ...base,
          recorded: d.entries,
          total: d.entries,
          pending: 0,
          na: 0,
          points: c.cap === undefined ? d.sum : Math.min(d.sum, c.cap),
          maxTotal: c.cap,
          status: d.closed ? "done" : "open",
          overdueEntry: false,
        });
        break;
      }
    }
  }
  for (const d of m.retakes) {
    const replaces = [...run.vals.replacedBy].find(([, slot]) => slot === d.slot.id)?.[0];
    out.push({
      id: d.slot.id,
      kind: "retake",
      label: d.slot.label,
      recorded: d.state === "known" ? 1 : 0,
      total: 1,
      pending: d.pending ? 1 : 0,
      na: d.state === "na" ? 1 : 0,
      points: d.state === "known" ? d.val.value : undefined,
      maxTotal: d.scale ? (d.scale.kind === "points" ? d.scale.max : 5) : undefined,
      status: d.state === "na" ? "na" : d.state === "known" ? "done" : "open",
      replaces,
      overdueEntry: overdue(d.slot.due, d.state),
    });
  }
  return out;
}
