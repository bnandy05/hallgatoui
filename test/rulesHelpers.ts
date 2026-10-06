// Builders for requirement results in the rules tests.
import { resultId, type RequirementResult, type ResultValue, type SubjectRules } from "@/lib/rules/types";
import { RULE_TEMPLATES } from "@/lib/rules/fixtures";

export const NOW = new Date("2026-10-05T12:00:00Z");

export function rules(id: string): SubjectRules {
  const t = RULE_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t.rules;
}

export function res(componentId: string, value: ResultValue, n = 1, extra: Partial<RequirementResult> = {}): RequirementResult {
  const instanceKey = `n:${n}`;
  return { id: resultId("c", componentId, instanceKey), courseId: "c", componentId, instanceKey, state: "recorded", value, ...extra };
}

export function state(componentId: string, s: "pending" | "na", n = 1): RequirementResult {
  const instanceKey = `n:${n}`;
  return { id: resultId("c", componentId, instanceKey), courseId: "c", componentId, instanceKey, state: s };
}

export const pts = (id: string, points: number, parts?: Record<string, number>, n = 1) =>
  res(id, parts ? { kind: "points", points, parts } : { kind: "points", points }, n);
export const grade = (id: string, g: 1 | 2 | 3 | 4 | 5) => res(id, { kind: "grade", grade: g });
export const asg = (id: string, outcome: string) => res(id, { kind: "assignment", outcome });

/** Items 1..values.length of a points series. */
export const seriesPts = (id: string, values: number[]) => values.map((v, i) => pts(id, v, undefined, i + 1));

/** Analízis röpdolgozat items with elmélet/gyakorlat parts, spread to hit the given totals. */
export function rdItems(elm: number, gyak: number, count = 10): RequirementResult[] {
  const out: RequirementResult[] = [];
  const split = (total: number) => Array.from({ length: count }, (_, i) => Math.min(2, Math.max(0, total - 2 * i)));
  const e = split(elm);
  const g = split(gyak);
  for (let i = 0; i < count; i++) out.push(pts("rd", e[i] + g[i], { elm: e[i], gyak: g[i] }, i + 1));
  return out;
}
