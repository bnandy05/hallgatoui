// Rule extraction from a pasted requirements document ("követelményrendszer"): segment → lexicon →
// assemble → validate. Pure and deterministic, so the browser and the server compute the same
// draft and the same questions; the only outside input is `answers` (from Jev or the student).
// The owner's rule: a result that fails validation is rejected as a whole, never half-applied.

import { evaluate } from "../engine";
import type { SubjectRules } from "../types";
import { validateRules } from "../validate";
import { assemble, type Answers, type Question } from "./assemble";
import { readGuided } from "./guided";
import { readDraft } from "./lexicon";
import { segment, MAX_EXTRACT_CHARS } from "./text";

export type { Answers, Question, QuestionOption } from "./assemble";
export { MAX_EXTRACT_CHARS };
export { NO_MENTION } from "./guided";

export interface Extraction {
  /** ok: the draft is valid (it may still have open questions); otherwise rejected with errors. */
  ok: boolean;
  rules: SubjectRules | null;
  errors: string[]; // Hungarian; why it was rejected
  questions: Question[];
  open: string[]; // ids of questions without an answer: saving waits for them
  unrecognised: string[]; // sentences no pattern understood
  sources: { label: string; quote: string }[];
  /** parser: the Hungarian patterns read it; guided: they didn't, so a questionnaire did (more to check). */
  mode: "parser" | "guided";
  /** Why the guided reading took over (the parser's own complaint), for the review screen. */
  notes: string[];
}

const MIN_RECOGNISED = 3;

const NOT_REQUIREMENTS = "A szövegből nem ismertünk fel követelményeket. Biztosan a követelményrendszert illesztetted be?";

export function extractRules(text: string, answers: Answers = {}, now = new Date()): Extraction {
  const sentences = segment(text);
  const draft = readDraft(sentences);
  const { rules, questions, errors, sources, totalId } = assemble(draft, answers);
  const unrecognised = sentences
    .filter((s) => !draft.used.has(s.index) && !draft.headings.has(s.index))
    .map((s) => s.text)
    .slice(0, 50);
  const recognised = draft.used.size >= MIN_RECOGNISED;
  const parsed = finish(rules, questions, errors, sources, answers, now, draft.totalStated?.value, totalId);
  if (recognised && parsed.ok) return { ...parsed, unrecognised, mode: "parser", notes: [] };

  // The patterns didn't get it: the guided questionnaire reads the same text instead. Its rules
  // only count once every question is answered; until then the review shows just the questions.
  const g = readGuided(sentences, answers);
  if (g.questions.length === 0 || (!g.rules && g.errors.length > 0 && !recognised)) {
    const why = recognised ? parsed.errors : [NOT_REQUIREMENTS, ...g.errors];
    return { ...parsed, ok: false, rules: null, errors: why, unrecognised, mode: "parser", notes: [] };
  }
  const notes = recognised ? parsed.errors.map((e) => `A szokásos megfogalmazások szerint olvasva: ${e}`) : [];
  const done = finish(g.rules, g.questions, g.errors, g.sources, answers, now);
  // A guided reading stays open to correction: wrong answers show as errors, not a rejection.
  return { ...done, ok: true, unrecognised: [], mode: "guided", notes };
}

function finish(
  rules: SubjectRules | null,
  questions: Question[],
  errors: string[],
  sources: { label: string; quote: string }[],
  answers: Answers,
  now: Date,
  totalStated?: number,
  totalId?: string
): Omit<Extraction, "unrecognised" | "mode" | "notes"> {
  const open = questions.filter((q) => !q.options.some((o) => o.id === answers[q.id])).map((q) => q.id);
  const base = { questions, open, sources };
  if (errors.length || !rules) return { ...base, ok: false, rules: null, errors: errors.length ? errors : ["A szövegből nem tudtunk szabályt összeállítani."] };
  const checked = validateRules(rules);
  if (!checked.ok) return { ...base, ok: false, rules: null, errors: checked.errors.map((e) => `Érvénytelen szabály: ${e}`) };
  const semantic = semanticErrors(checked.rules, now, totalStated, totalId);
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
