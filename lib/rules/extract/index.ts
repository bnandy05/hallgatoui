// Rule extraction from a pasted requirements document ("követelményrendszer"): segment → lexicon →
// assemble → validate. Pure and deterministic, so the browser and the server compute the same
// draft and the same questions; the only outside input is `answers` (from Jev or the student).
// The owner's rule: a result that fails validation is rejected as a whole, never half-applied.

import { evaluate } from "../engine";
import type { SubjectRules } from "../types";
import { validateRules } from "../validate";
import { assemble, type Answers, type Question } from "./assemble";
import { readDraft } from "./lexicon";
import { segment, MAX_EXTRACT_CHARS } from "./text";

export type { Answers, Question, QuestionOption } from "./assemble";
export { MAX_EXTRACT_CHARS };

export interface Extraction {
  /** ok: the draft is valid (it may still have open questions); otherwise rejected with errors. */
  ok: boolean;
  rules: SubjectRules | null;
  errors: string[]; // Hungarian; why it was rejected
  questions: Question[];
  open: string[]; // ids of questions without an answer: saving waits for them
  unrecognised: string[]; // sentences no pattern understood
  sources: { label: string; quote: string }[];
}

const MIN_RECOGNISED = 3;

export function extractRules(text: string, answers: Answers = {}, now = new Date()): Extraction {
  const sentences = segment(text);
  const draft = readDraft(sentences);
  const { rules, questions, errors, sources, totalId } = assemble(draft, answers);
  const unrecognised = sentences
    .filter((s) => !draft.used.has(s.index) && !draft.headings.has(s.index))
    .map((s) => s.text)
    .slice(0, 50);
  const open = questions.filter((q) => !q.options.some((o) => o.id === answers[q.id])).map((q) => q.id);
  const base = { questions, open, unrecognised, sources };

  if (draft.used.size < MIN_RECOGNISED) {
    return { ...base, ok: false, rules: null, errors: ["A szövegből nem ismertünk fel követelményeket. Biztosan a követelményrendszert illesztetted be?"] };
  }
  if (errors.length) return { ...base, ok: false, rules: null, errors };

  const checked = validateRules(rules);
  if (!checked.ok) return { ...base, ok: false, rules: null, errors: checked.errors.map((e) => `Érvénytelen szabály: ${e}`) };

  const semantic = semanticErrors(checked.rules, now, draft.totalStated?.value, totalId);
  if (semantic.length) return { ...base, ok: false, rules: null, errors: semantic };
  return { ...base, ok: true, rules: checked.rules, errors: [] };
}

/** Checks the schema can't express: the stated total adds up, every grade is reachable. */
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
