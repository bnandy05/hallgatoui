// Rule extraction from a pasted requirements document ("követelményrendszer"): segment → lexicon →
// assemble → validate. Pure and deterministic, so the browser and the server compute the same
// draft and the same questions; the only outside input is `answers` (from Jev or the student).
// The owner's rule: a result that fails validation is rejected as a whole, never half-applied.

import { getMessages, type Locale } from "@/lib/i18n";
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
  errors: string[]; // in the language it was extracted in; why it was rejected
  questions: Question[];
  open: string[]; // ids of questions without an answer: saving waits for them
  unrecognised: string[]; // sentences no pattern understood
  sources: { label: string; quote: string }[];
}

const MIN_RECOGNISED = 3;

export function extractRules(text: string, answers: Answers = {}, now = new Date(), locale: Locale = "hu"): Extraction {
  const sentences = segment(text);
  const draft = readDraft(sentences);
  const { rules, questions, errors, sources, totalId } = assemble(draft, answers, locale);
  const unrecognised = sentences
    .filter((s) => !draft.used.has(s.index) && !draft.headings.has(s.index))
    .map((s) => s.text)
    .slice(0, 50);
  const recognised = draft.used.size >= MIN_RECOGNISED;
  const parsed = finish(rules, questions, errors, sources, answers, now, locale, draft.totalStated?.value, totalId);
  if (!recognised) return { ...parsed, ok: false, rules: null, errors: [getMessages(locale).rules.extract.notRequirements], unrecognised };
  return { ...parsed, unrecognised };
}

function finish(
  rules: SubjectRules | null,
  questions: Question[],
  errors: string[],
  sources: { label: string; quote: string }[],
  answers: Answers,
  now: Date,
  locale: Locale,
  totalStated?: number,
  totalId?: string
): Omit<Extraction, "unrecognised"> {
  const t = getMessages(locale).rules.extract;
  const open = questions.filter((q) => !q.options.some((o) => o.id === answers[q.id])).map((q) => q.id);
  const base = { questions, open, sources };
  if (errors.length || !rules) return { ...base, ok: false, rules: null, errors: errors.length ? errors : [t.noRules] };
  const checked = validateRules(rules, locale);
  if (!checked.ok) return { ...base, ok: false, rules: null, errors: checked.errors.map((e) => t.invalidRule(e)) };
  const semantic = semanticErrors(checked.rules, now, totalStated, totalId, locale);
  if (semantic.length) return { ...base, ok: false, rules: null, errors: semantic };
  return { ...base, ok: true, rules: checked.rules, errors: [] };
}
