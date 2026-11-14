// "What do I need?" — the smallest value of one target (an exam, a retake slot or a series'
// remaining points) that still reaches a goal grade, by a linear scan over the target's discrete
// range. Keep the work bounded without skipping scores and reporting a false minimum.

import { getMessages, type Locale } from "@/lib/i18n";
import { buildModel, choiceVectors, runScenario, type Model, type Scenario } from "./engine";
import type { RequirementResult, Scale, SubjectRules } from "./types";

export interface SolveQuery {
  outcomeId: string;
  goal: number; // 1..5
  target: string; // exam id, retake slot id or series id
  others: "worst" | "best"; // the other unknowns: "biztosan" / "ha a többi is jól megy"
}

export interface SolveResult {
  status: "already" | "reachable" | "unreachable" | "indeterminate";
  min?: number; // exam/retake: the value; series: points (or + / passed items) still to collect
  /** All other retakes needed for this score, with the exam to replace when selectable. */
  viaRetakes?: { id: string; targetId?: string }[];
  /** The exam to replace when the queried component is itself a selectable retake. */
  retakeTarget?: string;
  reason?: string;
}

const MAX_SCENARIOS = 16_000;

type ScoreDomain = { max: number; scores: () => Iterable<number> };

function scaleDomain(scale: Scale): ScoreDomain {
  if (scale.kind === "grade") return { max: 5, scores: () => [1, 2, 3, 4, 5] };
  const { max } = scale;
  const step = scale.step ?? 1;
  return {
    max,
    *scores() {
      for (let i = 0; ; i++) {
        // Trim floating-point multiplication noise without rounding small steps to zero.
        const value = Number((i * step).toPrecision(15));
        if (value >= max) break;
        yield value;
      }
      yield max;
    },
  };
}

function domainOf(m: Model, target: string): ScoreDomain | "empty" | null {
  const exam = m.exams.get(target);
  if (exam) return scaleDomain(exam.comp.scale);
  const retake = m.retakes.find((r) => r.slot.id === target);
  if (retake) return retake.scale ? scaleDomain(retake.scale) : null;
  const series = m.series.get(target);
  if (series) {
    const s = series.comp.scoring;
    const top = s.kind === "points" ? series.unknown * s.max : series.unknown;
    const step = s.kind === "points" ? (s.step ?? 1) : 1;
    if (series.unknown === 0) return "empty";
    return scaleDomain({ kind: "points", max: top, step });
  }
  return null;
}

export function solveFor(rules: SubjectRules, results: RequirementResult[], now: Date, q: SolveQuery, locale: Locale = "hu"): SolveResult {
  const t = getMessages(locale).rules.solve;
  const m = buildModel(rules, results, now, locale);
  const outcome = rules.outcomes.find((o) => o.id === q.outcomeId);
  if (!outcome) return { status: "unreachable", reason: t.unknownGrade };
  const domain = domainOf(m, q.target);
  if (domain === null) return { status: "unreachable", reason: t.noRequirement };

  const none = new Map<string, true | string>();
  const grade = (sc: Scenario) => runScenario(m, sc).outcomes.get(q.outcomeId)!.grade;
  if (grade({ regular: "worst", alt: "worst", choice: none }) >= q.goal) return { status: "already" };
  if (domain === "empty") return { status: "unreachable", reason: t.nothingLeft };

  const retake = m.retakes.find((r) => r.slot.id === q.target);
  const retakeTargets: (string | undefined)[] = retake?.slot.pick === "choose" ? retake.slot.targets : [undefined];
  let remaining = MAX_SCENARIOS;
  const indeterminate: SolveResult = { status: "indeterminate", reason: t.searchLimit };

  // null means no score reached the goal, undefined means the scan could not finish.
  const scan = (choice: Map<string, true | string>): { min: number; retakeTarget?: string } | null | undefined => {
    let best: { min: number; retakeTarget?: string } | null = null;
    for (const retakeTarget of retakeTargets) {
      for (const v of domain.scores()) {
        if (best !== null && v >= best.min) break;
        if (remaining-- === 0) return undefined;
        const g = grade({ regular: q.others, alt: q.others, choice, override: { id: q.target, value: v, retakeTarget } });
        if (g >= q.goal) {
          best = { min: v, ...(retakeTarget && { retakeTarget }) };
          break;
        }
      }
    }
    return best;
  };

  const plain = scan(none);
  if (plain === undefined) return indeterminate;
  if (plain !== null) return { status: "reachable", ...plain };

  // With retakes taken as well (best value), fewest retakes first.
  const vectors = choiceVectors(m, q.target)
    .filter((c) => c.size > 0)
    .sort((a, b) => a.size - b.size);
  let found: { answer: NonNullable<ReturnType<typeof scan>>; choice: Map<string, true | string> } | null = null;
  for (const c of vectors) {
    if (found && c.size > found.choice.size) break;
    const v = scan(c);
    if (v === undefined) return indeterminate;
    if (v !== null && (!found || v.min < found.answer.min)) found = { answer: v, choice: c };
  }
  if (found) return {
    status: "reachable",
    ...found.answer,
    viaRetakes: [...found.choice].map(([id, target]) => ({ id, ...(typeof target === "string" && { targetId: target }) })),
  };

  return { status: "unreachable", reason: unreachableReason(m, q, domain.max, t) };
}

function unreachableReason(m: Model, q: SolveQuery, top: number, t: ReturnType<typeof getMessages>["rules"]["solve"]): string {
  const vectors = choiceVectors(m, q.target);
  let bestRun: { grade: number; run: ReturnType<typeof runScenario> } | null = null;
  for (const choice of vectors) {
    const run = runScenario(m, { regular: "best", alt: "best", choice, override: { id: q.target, value: top } });
    const g = run.outcomes.get(q.outcomeId)!.grade;
    if (!bestRun || g > bestRun.grade) bestRun = { grade: g, run };
  }
  if (!bestRun) return t.unreachable;
  if (q.others === "worst" && bestRun.grade >= q.goal) {
    return t.onlyIfOthers;
  }
  const o = bestRun.run.outcomes.get(q.outcomeId)!;
  if (o.failedGate) return t.gateUnmet(o.failedGate.label);
  const outcome = m.rules.outcomes.find((x) => x.id === q.outcomeId)!;
  const path = outcome.paths.find((p) => p.id === o.path);
  if (path && o.pathMax !== undefined && o.pathMax < q.goal) return t.pathMax(path.label, o.pathMax);
  return t.maxGrade(o.grade);
}
