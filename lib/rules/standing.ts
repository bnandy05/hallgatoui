// A course's standing in one line, for the home board and the reminders: the grade range of its
// first grade (usually the practice grade) and the one thing most at risk. Pure.

import { evaluate, type GradeValue } from "./engine";
import type { RequirementResult, SubjectRules } from "./types";

export interface Standing {
  /** "4", "3–5", "nincs jegy". */
  grade: string;
  /** The outcome's label ("Gyakorlati jegy"). */
  label: string;
  final: boolean;
  /** The most pressing problem, e.g. "Még 1 hiányzás fér bele"; null when nothing is at risk. */
  risk: string | null;
  /** Severe: a requirement already failed or no absence is left. */
  danger: boolean;
}

const gradeText = (g: GradeValue) => (g === 0 ? "nincs jegy" : String(g));

export function courseStanding(rules: SubjectRules, results: RequirementResult[], now: Date): Standing | null {
  const ev = evaluate(rules, results, now);
  const outcome = ev.outcomes[0];
  if (!outcome) return null;
  // "No grade" in the worst case reads as the lowest grade in a range; the risk line says why.
  const grade =
    outcome.status === "final" || outcome.best === outcome.worst
      ? gradeText(outcome.current ?? outcome.worst)
      : `${Math.max(outcome.worst, 1)}–${outcome.best}`;

  let risk: string | null = null;
  let danger = false;
  // Absences first: the one limit the student can still steer by showing up.
  for (const c of ev.components) {
    if (c.kind !== "attendance" || c.maxTotal === undefined || c.points === undefined) continue;
    const left = c.maxTotal - c.points;
    if (left < 0) {
      risk = "Túllépted a hiányzási határt";
      danger = true;
    } else if (left === 0) {
      risk = "Több hiányzás nem fér bele";
      danger = true;
    } else if (left === 1) {
      risk = "Még 1 hiányzás fér bele";
    }
  }
  if (!danger) {
    const failed = outcome.gates.find((g) => g.status === "failed");
    const fixable = outcome.gates.find((g) => g.status === "fixable");
    if (failed) {
      risk = `Nem teljesült: ${failed.label}`;
      danger = true;
    } else if (fixable && !risk) {
      risk = `Javítani kell: ${fixable.label}`;
    }
  }
  return { grade, label: outcome.label, final: outcome.status === "final", risk, danger };
}
