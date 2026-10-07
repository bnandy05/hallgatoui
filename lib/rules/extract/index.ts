// Rule extraction from a pasted requirements document ("követelményrendszer"): segment → lexicon →
// assemble → validate. Pure and deterministic, so the browser and the server compute the same
// draft and the same questions; the only outside input is `answers` (from Jev or the student).
// The owner's rule: a result that fails validation is rejected as a whole, never half-applied.

import type { SubjectRules } from "../types";
import { validateRules } from "../validate";
import { assemble, type Answers, type Question } from "./assemble";
import { readDraft } from "./lexicon";
import { semanticErrors } from "./semantic";
import { segment, MAX_EXTRACT_CHARS } from "./text";

export type { Answers, Question, QuestionOption } from "./assemble";
export { MAX_EXTRACT_CHARS };
export { semanticErrors };

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
  if (!recognised) return { ...parsed, ok: false, rules: null, errors: [NOT_REQUIREMENTS], unrecognised };
  return { ...parsed, unrecognised };
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
): Omit<Extraction, "unrecognised"> {
  const open = questions.filter((q) => !q.options.some((o) => o.id === answers[q.id])).map((q) => q.id);
  const base = { questions, open, sources };
  if (errors.length || !rules) return { ...base, ok: false, rules: null, errors: errors.length ? errors : ["A szövegből nem tudtunk szabályt összeállítani."] };
  const checked = validateRules(rules);
  if (!checked.ok) return { ...base, ok: false, rules: null, errors: checked.errors.map((e) => `Érvénytelen szabály: ${e}`) };
  const semantic = semanticErrors(checked.rules, now, totalStated, totalId);
  if (semantic.length) return { ...base, ok: false, rules: null, errors: semantic };
  return { ...base, ok: true, rules: checked.rules, errors: [] };
}
