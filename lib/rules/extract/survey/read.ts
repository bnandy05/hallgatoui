// Reading Jev's answers: validate the raw answers defensively, turn each into a field with its
// review flags, apply the gates and the consistency checks. Policy is explicit code here; the
// raw answers are kept in the draft so the thresholds can change without asking again.
// Pure; never throws on a malformed answer (it becomes a missing one).

import type { Candidate } from "./candidates";
import {
  FIELD_IDS,
  FIELD_META,
  GATES,
  GRADE_LIMIT_FIELDS,
  MAX_COUNT,
  SURVEY_FIELDS,
  asCount,
  asNumber,
  gateOpen,
  type FieldId,
  type FieldValue,
  type NumberValue,
  type SurveyValues,
} from "./fields";

/** A choice answer is flagged for review below this confidence. */
export const CHOICE_REVIEW_BELOW = 0.7;
/**
 * A Noul answer with P(yes) inside this band (exclusive) is flagged for review. Wider on the yes
 * side: a part that exists opens fields, and real wrong yeses came at 0.59–0.79 (October 2026).
 */
export const NOUL_REVIEW_BAND: readonly [number, number] = [0.25, 0.8];

/** Fields that ask for a lower end: a number the text gives as an upper end ("74 pontig") is suspect. */
const LOWER_ENDS = new Set<FieldId>([
  "zh_min_points",
  "quick_test_min_points",
  "theory_test_pass_threshold",
  "grade2_min_points",
  "grade3_min_points",
  "grade4_min_points",
  "grade5_min_points",
]);
export const UP_TO_REASON = "A szövegben ez a szám felső határ („…ig”), nem alsó; nézd meg, mi a sáv alja.";

export const MISSING_REASON = "Nem kaptunk választ, add meg te.";
export const EMPTY_REASON = "Töltsd ki a dokumentum alapján.";

export interface Field {
  value: FieldValue;
  flagged: boolean;
  reasons: string[]; // Hungarian
  confidence?: number;
  quote?: string; // the candidate's context, for a picked number
  hidden: boolean; // gated out, and the gate is not flagged
}

export type RawAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };

export interface SurveyDraft {
  fields: Record<FieldId, Field>;
  /** The validated answers as Jev gave them, so the thresholds can be re-applied. */
  raw: Partial<Record<FieldId, RawAnswer>>;
}

const ALWAYS_FLAGGED: Record<string, string> = {
  unclear: "A dokumentum ezt nem írja le egyértelműen.",
  not_described: "A dokumentum ezt nem írja le egyértelműen.",
  other: "Más módszert találtunk, amit nem tudunk felírni.",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isProb = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmt = (n: number) => String(n).replace(".", ",");

/** The labels an answer to this field may pick. */
function labelsOf(id: FieldId, candidates: Candidate[]): Set<string> | null {
  const meta = FIELD_META[id];
  if (meta.kind === "yesno") return null;
  if (meta.kind === "enum") return new Set(meta.options!.map((o) => o.value));
  if (meta.kind === "count") return new Set(["none", ...Array.from({ length: MAX_COUNT }, (_, i) => `n${i + 1}`)]);
  return new Set(["none", ...candidates.map((c) => c.id)]);
}

function parseAnswer(id: FieldId, a: unknown, candidates: Candidate[]): RawAnswer | null {
  if (!isObj(a)) return null;
  const labels = labelsOf(id, candidates);
  if (labels === null) {
    return a.type === "noul" && isProb(a.noul) ? { type: "noul", noul: a.noul } : null;
  }
  if (a.type !== "choice" || typeof a.choice !== "string" || !labels.has(a.choice) || !isProb(a.confidence)) return null;
  const probabilities: Record<string, number> = {};
  if (isObj(a.probabilities)) for (const [k, p] of Object.entries(a.probabilities)) if (labels.has(k) && isProb(p)) probabilities[k] = p;
  return { type: "choice", choice: a.choice, confidence: a.confidence, probabilities };
}

/** What a valid answer says, before any gate or flag. */
export function answerValue(id: FieldId, a: RawAnswer, candidates: Candidate[]): { value: FieldValue; quote?: string } {
  if (a.type === "noul") return { value: a.noul >= 0.5 };
  const kind = FIELD_META[id].kind;
  if (kind === "count") return { value: a.choice === "none" ? null : Number(a.choice.slice(1)) };
  if (kind === "point") {
    const c = a.choice === "none" ? undefined : candidates.find((x) => x.id === a.choice);
    return c ? { value: { value: c.value, percent: c.percent }, quote: c.context } : { value: null };
  }
  return { value: a.choice };
}

function fieldOf(id: FieldId, a: RawAnswer | undefined, candidates: Candidate[]): Field {
  if (!a) return { value: null, flagged: true, reasons: [MISSING_REASON], hidden: false };
  const reasons: string[] = [];
  if (a.type === "noul") {
    const flagged = a.noul > NOUL_REVIEW_BAND[0] && a.noul < NOUL_REVIEW_BAND[1];
    if (flagged) reasons.push(`Bizonytalan válasz (${pct(a.noul)} az esélye, hogy igen).`);
    return { value: a.noul >= 0.5, flagged, reasons, confidence: Math.max(a.noul, 1 - a.noul), hidden: false };
  }
  const meta = FIELD_META[id];
  const { value, quote } = answerValue(id, a, candidates);
  let flagged = false;
  if (a.confidence < CHOICE_REVIEW_BELOW) {
    flagged = true;
    reasons.push(`Bizonytalan válasz (${pct(a.confidence)}).`);
  }
  const picked = meta.kind === "point" ? candidates.find((c) => c.id === a.choice) : undefined;
  if (picked?.upTo && LOWER_ENDS.has(id)) {
    flagged = true;
    reasons.push(UP_TO_REASON);
  }
  if (meta.kind === "enum" && a.choice in ALWAYS_FLAGGED) {
    flagged = true;
    reasons.push(ALWAYS_FLAGGED[a.choice]);
  }
  return { value, flagged, reasons, confidence: a.confidence, ...(quote && { quote }), hidden: false };
}

export function readSurvey(answers: unknown, candidates: Candidate[]): SurveyDraft {
  const source = isObj(answers) ? answers : {};
  const raw: SurveyDraft["raw"] = {};
  const fields = {} as Record<FieldId, Field>;
  for (const id of FIELD_IDS) {
    const a = parseAnswer(id, source[id], candidates);
    if (a) raw[id] = a;
    fields[id] = fieldOf(id, a ?? undefined, candidates);
  }

  // Gates. A closed gate that is sure hides the detail and drops its answer. A gate that is itself
  // in doubt, open or closed, flags the details that carry a value: they are only as sure as their
  // gate. A detail that says "none" stays as it is; if the part does exist, the consistency check
  // below (required values) or the rules builder asks for the missing value.
  const values = valuesOf(fields);
  for (const id of FIELD_IDS) {
    const g = GATES[id];
    if (!g) continue;
    const f = fields[id];
    if (fields[g.gate].flagged) {
      if (f.value === null) continue;
      f.flagged = true;
      f.reasons.push(`Attól függ, hogy ${g.phrase}.`);
    } else if (!gateOpen(id, values)) {
      fields[id] = { value: null, flagged: false, reasons: [], hidden: true };
    }
  }

  for (const [id, reason] of consistency(valuesOf(fields))) {
    const f = fields[id];
    if (f.hidden) continue;
    f.flagged = true;
    if (!f.reasons.includes(reason)) f.reasons.push(reason);
  }
  return { fields, raw };
}

function valuesOf(fields: Record<FieldId, Field>): SurveyValues {
  return Object.fromEntries(FIELD_IDS.map((id) => [id, fields[id].hidden ? null : fields[id].value])) as SurveyValues;
}

/** The form state a draft starts from: hidden fields are none. */
export function surveyValues(draft: SurveyDraft): SurveyValues {
  return valuesOf(draft.fields);
}

/** Every field empty and flagged, for when Jev is unavailable. */
export function emptySurvey(): SurveyDraft {
  const fields = Object.fromEntries(
    SURVEY_FIELDS.map((f) => [f.id, { value: null, flagged: true, reasons: [EMPTY_REASON], hidden: false } satisfies Field])
  ) as Record<FieldId, Field>;
  return { fields, raw: {} };
}

// ----- consistency -----

const REQUIRED: Partial<Record<FieldId, string>> = {
  zh_count: "A zh-k számát nem találtuk a szövegben.",
  zh_max_points: "Egy zh maximális pontszámát nem találtuk a szövegben.",
  quick_test_count: "A röpzh-k számát nem találtuk; 1-nek vesszük.",
  quick_test_total_max: "A röpzh-k összpontszámát nem találtuk a szövegben.",
  assignment_count: "A beadandók számát nem találtuk; 1-nek vesszük.",
  assignment_points_on_time: "A beadandó pontszámát nem találtuk a szövegben.",
  grade2_min_points: "Ennek a jegynek a határát nem találtuk a szövegben.",
  grade3_min_points: "Ennek a jegynek a határát nem találtuk a szövegben.",
  grade4_min_points: "Ennek a jegynek a határát nem találtuk a szövegben.",
  grade5_min_points: "Ennek a jegynek a határát nem találtuk a szövegben.",
};


/**
 * Things that cannot all be true, each as [field, Hungarian reason]. Never fixes anything: the
 * student decides. `values` are post-gate (a gated-out detail is null).
 */
export function consistency(values: SurveyValues): [FieldId, string][] {
  const out: [FieldId, string][] = [];
  const add = (id: FieldId, reason: string) => out.push([id, reason]);

  for (const [id, reason] of Object.entries(REQUIRED) as [FieldId, string][]) {
    if (GATES[id] && gateOpen(id, values) && values[id] === null) add(id, reason);
  }

  const zhMax = asNumber(values.zh_max_points);
  const zhMin = asNumber(values.zh_min_points);
  if (zhMax && zhMin && zhMax.percent === zhMin.percent && zhMin.value > zhMax.value) {
    add("zh_min_points", `A zh minimuma (${fmt(zhMin.value)}) nagyobb a maximumnál (${fmt(zhMax.value)}).`);
  }
  const qTotal = asNumber(values.quick_test_total_max);
  const qMin = asNumber(values.quick_test_min_points);
  if (qTotal && qMin && qTotal.percent === qMin.percent && qMin.value > qTotal.value) {
    add("quick_test_min_points", `A röpzh-k minimuma (${fmt(qMin.value)}) nagyobb az összpontszámnál (${fmt(qTotal.value)}).`);
  }

  const limits = GRADE_LIMIT_FIELDS.map((id) => ({ id, v: asNumber(values[id]) })).filter((l): l is { id: (typeof GRADE_LIMIT_FIELDS)[number]; v: NumberValue } => l.v !== null);
  if (limits.some((l) => l.v.percent) && limits.some((l) => !l.v.percent)) {
    for (const l of limits) add(l.id, "A ponthatárok egy része százalék, másik része pont.");
  }
  let previous: number | null = null;
  for (const l of limits) {
    if (previous !== null && l.v.value <= previous) add(l.id, "A ponthatároknak a jegyekkel szigorúan emelkedniük kell (2 < 3 < 4 < 5).");
    previous = l.v.value;
  }
  const total = asNumber(values.final_total_max);
  for (const l of limits) {
    if (l.v.percent && l.v.value > 100) add(l.id, "Egy százalékos határ nem lehet 100% fölött.");
    else if (!l.v.percent && total && !total.percent && l.v.value > total.value) {
      add(l.id, `A határ (${fmt(l.v.value)}) nagyobb a legnagyobb összpontszámnál (${fmt(total.value)}).`);
    }
  }

  // The components' points add up to the stated maximum (only when the grade adds up raw points).
  if (total && !total.percent && values.grade_calculation === "raw_points_to_bands") {
    const parts = componentTotal(values);
    if (parts !== null && Math.abs(parts - total.value) > 1e-9) {
      add("final_total_max", `Az összetevők pontjai ${fmt(parts)} pontot adnak, a megadott maximum ${fmt(total.value)}.`);
    }
  }
  return out;
}

/** zh max × count + short tests + assignments, or null when a present part is unknown. */
export function componentTotal(values: SurveyValues): number | null {
  let sum = 0;
  let any = false;
  if (values.zh_scoring === "points") {
    const max = asNumber(values.zh_max_points);
    const count = asCount(values.zh_count);
    if (!max || max.percent || count === null) return null;
    sum += max.value * count;
    any = true;
  }
  if (values.has_quick_tests === true) {
    const t = asNumber(values.quick_test_total_max);
    if (!t || t.percent) return null;
    sum += t.value;
    any = true;
  }
  if (values.has_assignment === true) {
    const p = asNumber(values.assignment_points_on_time);
    if (!p || p.percent) return null;
    sum += p.value * (asCount(values.assignment_count) ?? 1);
    any = true;
  }
  return any ? Math.round(sum * 1e6) / 1e6 : null;
}

