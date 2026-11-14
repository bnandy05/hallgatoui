// The demo's requirement tracker data: the Calculus I template (lib/rules/fixtures.ts) as the
// rules of one demo course, a few recorded results and, in English, the template's labels
// translated by id (the fixtures are Hungarian documents' rules; the structure, ids and formulas
// stay exactly the template's). Pure.

import type { Locale } from "@/lib/i18n/locales";
import { ruleTemplate } from "@/lib/rules/fixtures";
import { resultId, type RequirementResult, type RequirementRules, type SubjectRules } from "@/lib/rules/types";

export const DEMO_RULES_COURSE_ID = "demo-course-anal";
const TEMPLATE_ID = "elte-ttk-analizis1";

/** English texts by id: components, parts, retakes, derived values, outcomes, gates, paths. */
const EN = {
  components: { rd: "Pop quiz", z1: "Midterm 1", z2: "Midterm 2" },
  parts: { elm: "Theory", gyak: "Practice", tetel: "Theory question", feladat: "Problems" },
  retakes: { pot: "Resit (the failed topic)" },
  derived: { f: "Pop quizzes total (F)", o: "Total = F/2 + M1 + M2" },
  outcomes: { gyak: "Practical grade", megaj: "Offered exam grade" },
  gates: {
    "gyak.rd": "Pop quizzes: theory ≥ 8 and practice ≥ 8",
    "gyak.alap.zh": "Both midterms ≥ 11",
    "megaj.jegy": "Has a practical grade of at least 2",
    "megaj.rdelm": "Pop quiz theory ≥ 12",
    "megaj.tetel": "Theory points ≥ 5 (≥ 2 per midterm)",
  },
  paths: { "gyak.alap": "Based on the total", "megaj.alap": "By the practical grade" },
  flags: [
    "F/2 can be a fraction: table limits are read as ≥ (45.5 → 2). Rounding?",
    "The value of the offered exam grade is not given; the practical grade is assumed.",
    "Theory question: 4 points per midterm assumed (out of 8).",
  ],
} as const;

function translate(rules: SubjectRules): SubjectRules {
  const copy = structuredClone(rules);
  for (const c of copy.components) {
    c.label = EN.components[c.id as keyof typeof EN.components] ?? c.label;
    const parts = c.kind === "exam" && c.scale.kind === "points" ? c.scale.parts : c.kind === "series" && c.scoring.kind === "points" ? c.scoring.parts : undefined;
    for (const p of parts ?? []) p.label = EN.parts[p.id as keyof typeof EN.parts] ?? p.label;
  }
  for (const r of copy.retakes) r.label = EN.retakes[r.id as keyof typeof EN.retakes] ?? r.label;
  for (const d of copy.derived) d.label = EN.derived[d.id as keyof typeof EN.derived] ?? d.label;
  for (const o of copy.outcomes) {
    o.label = EN.outcomes[o.id as keyof typeof EN.outcomes] ?? o.label;
    for (const g of o.gates ?? []) g.label = EN.gates[`${o.id}.${g.id}` as keyof typeof EN.gates] ?? g.label;
    for (const p of o.paths) {
      p.label = EN.paths[`${o.id}.${p.id}` as keyof typeof EN.paths] ?? p.label;
      for (const g of p.gates ?? []) g.label = EN.gates[`${o.id}.${p.id}.${g.id}` as keyof typeof EN.gates] ?? g.label;
    }
  }
  copy.flags = copy.flags.map((f, i) => ({ ...f, message: EN.flags[i] ?? f.message }));
  return copy;
}

/** Rules and results of the demo course; `now` stamps them. */
export function buildDemoRequirements(now: Date, locale: Locale): { rules: RequirementRules[]; results: RequirementResult[] } {
  const template = ruleTemplate(TEMPLATE_ID);
  if (!template) return { rules: [], results: [] };
  const courseId = DEMO_RULES_COURSE_ID;
  const stamp = now.toISOString();
  const rules: RequirementRules = {
    ...(locale === "en" ? translate(template.rules) : structuredClone(template.rules)),
    id: `rules:${courseId}`,
    courseId,
    source: "template",
    templateId: TEMPLATE_ID,
    updatedAt: stamp,
  };
  const result = (componentId: string, instanceKey: string, value: RequirementResult["value"]): RequirementResult => ({
    id: resultId(courseId, componentId, instanceKey),
    courseId,
    componentId,
    instanceKey,
    state: "recorded",
    value,
    updatedAt: stamp,
  });
  const quiz = (n: number, elm: number, gyak: number) => result("rd", `n:${n}`, { kind: "points", points: elm + gyak, parts: { elm, gyak } });
  const results = [
    quiz(1, 2, 2),
    quiz(2, 1, 2),
    quiz(3, 2, 1),
    quiz(4, 2, 2),
    result("z1", "n:1", { kind: "points", points: 32, parts: { tetel: 3, feladat: 29 } }),
  ];
  return { rules: [rules], results };
}
