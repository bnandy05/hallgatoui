// Checks the schema can't express: a stated total adds up, tables rise, every grade is reachable.
// Shared by the pattern parser and the survey. Pure.

import { evaluate } from "../engine";
import type { SubjectRules } from "../types";

export function semanticErrors(rules: SubjectRules, now: Date, totalStated?: number, totalId?: string): string[] {
  const out: string[] = [];
  let ev;
  try {
    ev = evaluate(rules, [], now);
  } catch {
    return ["A kiolvasott szabályokat nem tudjuk kiértékelni."];
  }
  if (totalStated !== undefined && totalId) {
    const max = ev.derived[totalId]?.best;
    if (max !== undefined && Math.abs(max - totalStated) > 1e-9) {
      out.push(`A dokumentum szerint összesen ${totalStated} pont szerezhető, a kiolvasott összetevőkből viszont ${max} jön ki.`);
    }
  }
  for (const t of rules.tables) {
    for (let i = 1; i < t.rows.length; i++) {
      if (t.rows[i].value < t.rows[i - 1].value) out.push(`A(z) „${t.id}” táblázat nagyobb pontszámhoz rosszabb jegyet ad.`);
    }
  }
  for (const o of ev.outcomes) {
    if (o.best < 2) out.push(`„${o.label}”: a kiolvasott szabályokkal még a legjobb esetben sem érhető el elégséges.`);
  }
  if (rules.outcomes.length === 0) out.push("Nem találtunk jegyet a szövegben.");
  return out;
}
