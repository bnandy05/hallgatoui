// Grade equivalence between two rule sets (the extraction's release gate, README §M3.6): random
// result sets, built from the expected rules and renamed into the extracted rules' ids, must give
// the same grade, bounds and status for every outcome. Component ids may differ ("z1" vs "zh1"),
// so components are paired by kind and order, retakes by order. Pure; seeded, so reproducible.

import { evaluate } from "../engine";
import { resultId, type RequirementResult, type ResultValue, type RuleComponent, type Scale, type SubjectRules } from "../types";

export interface Mismatch {
  outcome: string;
  expected: string;
  extracted: string;
  results: RequirementResult[];
}

/** expected id → extracted id, or the reason the two can't be paired. */
export function pairIds(expected: SubjectRules, extracted: SubjectRules): { ok: true; map: Map<string, string> } | { ok: false; error: string } {
  const map = new Map<string, string>();
  const kinds = new Set(expected.components.map((c) => c.kind));
  for (const kind of kinds) {
    const a = expected.components.filter((c) => c.kind === kind);
    const b = extracted.components.filter((c) => c.kind === kind);
    if (a.length !== b.length) return { ok: false, error: `${kind}: ${a.length} expected, ${b.length} extracted` };
    a.forEach((c, i) => map.set(c.id, b[i].id));
  }
  if (expected.retakes.length !== extracted.retakes.length) {
    return { ok: false, error: `retakes: ${expected.retakes.length} expected, ${extracted.retakes.length} extracted` };
  }
  expected.retakes.forEach((r, i) => map.set(r.id, extracted.retakes[i].id));
  return { ok: true, map };
}

/** Mulberry32: a small seeded generator, enough for test scenarios. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointsValue(r: () => number, max: number, parts?: { id: string; max: number }[]): ResultValue {
  if (!parts?.length) return { kind: "points", points: Math.floor(r() * (max + 1)) };
  const p: Record<string, number> = {};
  let sum = 0;
  for (const part of parts) {
    p[part.id] = Math.floor(r() * (part.max + 1));
    sum += p[part.id];
  }
  return { kind: "points", points: sum, parts: p };
}

function examValue(r: () => number, scale: Scale): ResultValue {
  if (scale.kind === "grade") return { kind: "grade", grade: (1 + Math.floor(r() * 5)) as 1 | 2 | 3 | 4 | 5 };
  return pointsValue(r, scale.max, scale.parts);
}

/** A random but valid result set for `rules` (course "c", instance keys "n:<i>"). */
export function randomResults(rules: SubjectRules, r: () => number): RequirementResult[] {
  const out: RequirementResult[] = [];
  const add = (componentId: string, n: number, value?: ResultValue, extra: Partial<RequirementResult> = {}) => {
    const instanceKey = `n:${n}`;
    const roll = r();
    const st: RequirementResult["state"] = value === undefined ? "na" : roll < 0.05 ? "pending" : roll < 0.08 ? "na" : "recorded";
    out.push({
      id: resultId("c", componentId, instanceKey),
      courseId: "c",
      componentId,
      instanceKey,
      state: st,
      ...(st === "recorded" ? { value } : {}),
      ...extra,
    });
  };
  const comps = new Map<string, RuleComponent>(rules.components.map((c) => [c.id, c]));
  for (const c of rules.components) {
    if (r() < 0.25) continue; // nothing recorded yet
    switch (c.kind) {
      case "exam":
        add(c.id, 1, examValue(r, c.scale));
        break;
      case "assignment":
        add(c.id, 1, { kind: "assignment", outcome: c.outcomes[Math.floor(r() * c.outcomes.length)].id });
        break;
      case "series": {
        const n = Math.floor(r() * (c.count + 1));
        for (let i = 1; i <= n; i++) {
          const s = c.scoring;
          const v: ResultValue =
            s.kind === "plusMinus"
              ? { kind: "pm", sign: r() < 0.6 ? "+" : "-" }
              : s.kind === "percent"
                ? { kind: "quiz", bestPercent: Math.floor(r() * 101), onTime: r() < 0.8 }
                : pointsValue(r, s.max, s.parts);
          add(c.id, i, v);
        }
        break;
      }
      case "attendance": {
        const n = Math.floor(r() * 9);
        for (let i = 1; i <= n; i++) {
          const roll = r();
          add(c.id, i, { kind: "attendance", status: roll < 0.5 ? "present" : roll < 0.75 ? "excused" : "unexcused" });
        }
        break;
      }
      case "bonus": {
        const n = Math.floor(r() * 4);
        for (let i = 1; i <= n; i++) add(c.id, i, { kind: "bonus", points: Math.floor(r() * 6) });
        break;
      }
    }
  }
  for (const slot of rules.retakes) {
    if (r() < 0.6) continue;
    const first = comps.get(slot.targets[0]);
    if (first?.kind !== "exam") continue;
    const target = slot.targets[Math.floor(r() * slot.targets.length)];
    add(slot.id, 1, examValue(r, first.scale), slot.pick === "choose" ? { retakeOf: target } : {});
  }
  return out;
}

export function renameResults(results: RequirementResult[], map: Map<string, string>): RequirementResult[] {
  return results.map((x) => {
    const componentId = map.get(x.componentId) ?? x.componentId;
    const renamed: RequirementResult = { ...x, componentId, id: resultId(x.courseId, componentId, x.instanceKey) };
    if (x.retakeOf) renamed.retakeOf = map.get(x.retakeOf) ?? x.retakeOf;
    return renamed;
  });
}

/** Runs `runs` random scenarios; returns the first few mismatches (empty = equivalent). */
export function compareRules(expected: SubjectRules, extracted: SubjectRules, runs = 300, seed = 1, now = new Date("2026-10-05T12:00:00Z")): Mismatch[] | string {
  const paired = pairIds(expected, extracted);
  if (!paired.ok) return paired.error;
  const r = rng(seed);
  const out: Mismatch[] = [];
  const show = (o: { current: number | null; best: number; worst: number; status: string } | undefined) =>
    o ? `${o.status} ${o.current ?? "-"} [${o.worst}–${o.best}]` : "missing";
  for (let i = 0; i < runs && out.length < 5; i++) {
    const results = randomResults(expected, r);
    const a = evaluate(expected, results, now);
    const b = evaluate(extracted, renameResults(results, paired.map), now);
    for (const o of a.outcomes) {
      const x = show(o);
      const y = show(b.outcomes.find((q) => q.outcomeId === o.outcomeId));
      if (x !== y) out.push({ outcome: o.outcomeId, expected: x, extracted: y, results });
    }
  }
  return out;
}
