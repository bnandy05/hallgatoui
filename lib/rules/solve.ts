// "What do I need?" — the smallest value of one target (an exam, a retake slot or a series'
// remaining points) that still reaches a goal grade, by a linear scan over the target's discrete
// range. Exact for monotone rules. Design in plans/requirements-tracker/schema.md §4.

import { buildModel, choiceVectors, runScenario, type Model, type Scenario } from "./engine";
import type { RequirementResult, Scale, SubjectRules } from "./types";

export interface SolveQuery {
  outcomeId: string;
  goal: number; // 1..5
  target: string; // exam id, retake slot id or series id
  others: "worst" | "best"; // the other unknowns: "biztosan" / "ha a többi is jól megy"
}

export interface SolveResult {
  status: "already" | "reachable" | "unreachable";
  min?: number; // exam/retake: the value; series: points (or + / passed items) still to collect
  viaRetake?: string; // the retake slot that has to be taken as well
  reason?: string;
}

const MAX_STEPS = 2000;

function scaleDomain(scale: Scale): number[] {
  if (scale.kind === "grade") return [1, 2, 3, 4, 5];
  const step = scale.step ?? 1;
  const n = Math.min(MAX_STEPS, Math.floor(scale.max / step + 1e-9));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Math.min(scale.max, Math.round(i * step * 1e6) / 1e6));
  if (out[out.length - 1] < scale.max) out.push(scale.max);
  return out;
}

function domainOf(m: Model, target: string): number[] | null {
  const exam = m.exams.get(target);
  if (exam) return scaleDomain(exam.comp.scale);
  const retake = m.retakes.find((r) => r.slot.id === target);
  if (retake) return retake.scale ? scaleDomain(retake.scale) : null;
  const series = m.series.get(target);
  if (series) {
    const s = series.comp.scoring;
    const top = s.kind === "points" ? series.unknown * s.max : series.unknown;
    const step = s.kind === "points" ? (s.step ?? 1) : 1;
    if (series.unknown === 0) return [];
    return scaleDomain({ kind: "points", max: top, step });
  }
  return null;
}

export function solveFor(rules: SubjectRules, results: RequirementResult[], now: Date, q: SolveQuery): SolveResult {
  const m = buildModel(rules, results, now);
  const outcome = rules.outcomes.find((o) => o.id === q.outcomeId);
  if (!outcome) return { status: "unreachable", reason: "Ismeretlen jegy." };
  const domain = domainOf(m, q.target);
  if (domain === null) return { status: "unreachable", reason: "Ehhez az összetevőhöz nem számolható szükséges eredmény." };

  const none = new Map<string, true | string>();
  const grade = (sc: Scenario) => runScenario(m, sc).outcomes.get(q.outcomeId)!.grade;
  if (grade({ regular: "worst", alt: "worst", choice: none }) >= q.goal) return { status: "already" };
  if (domain.length === 0) return { status: "unreachable", reason: "Nincs hátralévő tétel." };

  const retake = m.retakes.find((r) => r.slot.id === q.target);
  const retakeTargets: (string | undefined)[] = retake?.slot.pick === "choose" ? retake.slot.targets : [undefined];

  // The smallest value reaching the goal under a choice vector, or null.
  const scan = (choice: Map<string, true | string>): number | null => {
    let best: number | null = null;
    for (const retakeTarget of retakeTargets) {
      for (const v of domain) {
        if (best !== null && v >= best) break;
        const g = grade({ regular: q.others, alt: q.others, choice, override: { id: q.target, value: v, retakeTarget } });
        if (g >= q.goal) {
          best = v;
          break;
        }
      }
    }
    return best;
  };

  const plain = scan(none);
  if (plain !== null) return { status: "reachable", min: plain };

  // With retakes taken as well (best value), fewest retakes first.
  const vectors = choiceVectors(m, q.target)
    .filter((c) => c.size > 0)
    .sort((a, b) => a.size - b.size);
  let found: { min: number; via: string; size: number } | null = null;
  for (const c of vectors) {
    if (found && c.size > found.size) break;
    const v = scan(c);
    if (v !== null && (!found || v < found.min)) found = { min: v, via: [...c.keys()][0], size: c.size };
  }
  if (found) return { status: "reachable", min: found.min, viaRetake: found.via };

  return { status: "unreachable", reason: unreachableReason(m, q, domain[domain.length - 1]) };
}

function unreachableReason(m: Model, q: SolveQuery, top: number): string {
  const vectors = choiceVectors(m, q.target);
  let bestRun: { grade: number; run: ReturnType<typeof runScenario> } | null = null;
  for (const choice of vectors) {
    const run = runScenario(m, { regular: "best", alt: "best", choice, override: { id: q.target, value: top } });
    const g = run.outcomes.get(q.outcomeId)!.grade;
    if (!bestRun || g > bestRun.grade) bestRun = { grade: g, run };
  }
  if (!bestRun) return "A cél nem érhető el.";
  if (q.others === "worst" && bestRun.grade >= q.goal) {
    return "Csak akkor érhető el, ha a többi eredmény is jól alakul.";
  }
  const o = bestRun.run.outcomes.get(q.outcomeId)!;
  if (o.failedGate) return `Nem teljesíthető feltétel: ${o.failedGate.label}.`;
  const outcome = m.rules.outcomes.find((x) => x.id === q.outcomeId)!;
  const path = outcome.paths.find((p) => p.id === o.path);
  if (path && o.pathMax !== undefined && o.pathMax < q.goal) return `${path.label}: legfeljebb ${o.pathMax}-es jegy szerezhető.`;
  return `Legfeljebb ${o.grade}-es jegy érhető el.`;
}
