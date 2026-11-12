// Checks the schema can't express: a stated total adds up, tables rise, every grade is reachable.
// Shared by the pattern parser and the survey. Pure.

import { getMessages, type Locale } from "@/lib/i18n";
import { evaluate } from "../engine";
import type { SubjectRules } from "../types";

export function semanticErrors(rules: SubjectRules, now: Date, totalStated?: number, totalId?: string, locale: Locale = "hu"): string[] {
  const t = getMessages(locale).rules.extract.semantic;
  const out: string[] = [];
  let ev;
  try {
    ev = evaluate(rules, [], now, locale);
  } catch {
    return [t.cannotEvaluate];
  }
  if (totalStated !== undefined && totalId) {
    const max = ev.derived[totalId]?.best;
    if (max !== undefined && Math.abs(max - totalStated) > 1e-9) {
      out.push(t.totalMismatch(totalStated, max));
    }
  }
  for (const tb of rules.tables) {
    for (let i = 1; i < tb.rows.length; i++) {
      if (tb.rows[i].value < tb.rows[i - 1].value) out.push(t.tableDescends(tb.id));
    }
  }
  for (const o of ev.outcomes) {
    if (o.best < 2) out.push(t.cannotPass(o.label));
  }
  if (rules.outcomes.length === 0) out.push(t.noGrade);
  return out;
}
