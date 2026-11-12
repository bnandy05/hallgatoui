// The survey's fields: one per question Jev answers, with what the form needs (label in the UI language,
// section, kind, enum options) and the gates that tie a detail to the structure answer saying the
// part exists. Pure; shared by the question builder, the reader, the rules builder and the form.

import { getMessages, type Locale } from "@/lib/i18n";

export const GRADE_TYPES = ["practice_grade_only", "exam_only", "practice_and_exam", "unclear"] as const;
export const ZH_SCORING = ["points", "grade_1_5", "pass_fail", "no_zh", "not_described"] as const;
export const GRADE_CALCULATION = [
  "raw_points_to_bands",
  "component_grades_to_points",
  "average_of_grades",
  "other",
  "not_described",
] as const;

export const FIELD_IDS = [
  "grade_types",
  "attendance_mandatory",
  "has_quick_tests",
  "has_assignment",
  "has_theory_test_in_semester",
  "has_retake",
  "has_offered_exam_grade",
  "zh_scoring",
  "grade_calculation",
  "max_absences",
  "zh_count",
  "quick_test_count",
  "assignment_count",
  "zh_max_points",
  "zh_min_points",
  "quick_test_total_max",
  "quick_test_min_points",
  "assignment_points_on_time",
  "theory_test_pass_threshold",
  "final_total_max",
  "grade2_min_points",
  "grade3_min_points",
  "grade4_min_points",
  "grade5_min_points",
] as const;
export type FieldId = (typeof FIELD_IDS)[number];

/** The lowest total for grades 2, 3, 4, 5, in that order. */
export const GRADE_LIMIT_FIELDS = ["grade2_min_points", "grade3_min_points", "grade4_min_points", "grade5_min_points"] as const;

export interface NumberValue {
  value: number;
  percent: boolean;
}
export type FieldValue = boolean | string | number | NumberValue | null;
/** The plain form state (no flags): what the rules are built from. */
export type SurveyValues = Record<FieldId, FieldValue>;

/** yesno: a Noul; enum: a Choice over fixed labels; count: n1…n15 or none; point: a candidate or none. */
export type FieldKind = "yesno" | "enum" | "count" | "point";

export type SectionId = "jegy" | "jelenlet" | "zh" | "rop" | "bead" | "elmelet" | "potlas" | "hatarok";

export interface FieldMeta {
  id: FieldId;
  label: string; // for the form, in the language it was built for
  section: SectionId;
  kind: FieldKind;
  options?: { value: string; label: string }[]; // enum labels, as the question's criteria keys
}

export const MAX_COUNT = 15;

/** What does not depend on the language: id, section, kind and the values of an enum. */
const STRUCTURE: { id: FieldId; section: SectionId; kind: FieldKind; options?: string[] }[] = [
  { id: "grade_types", section: "jegy", kind: "enum", options: [...GRADE_TYPES] },
  { id: "grade_calculation", section: "jegy", kind: "enum", options: [...GRADE_CALCULATION] },
  { id: "attendance_mandatory", section: "jelenlet", kind: "yesno" },
  { id: "max_absences", section: "jelenlet", kind: "point" },
  { id: "zh_scoring", section: "zh", kind: "enum", options: [...ZH_SCORING] },
  { id: "zh_count", section: "zh", kind: "count" },
  { id: "zh_max_points", section: "zh", kind: "point" },
  { id: "zh_min_points", section: "zh", kind: "point" },
  { id: "has_quick_tests", section: "rop", kind: "yesno" },
  { id: "quick_test_count", section: "rop", kind: "count" },
  { id: "quick_test_total_max", section: "rop", kind: "point" },
  { id: "quick_test_min_points", section: "rop", kind: "point" },
  { id: "has_assignment", section: "bead", kind: "yesno" },
  { id: "assignment_count", section: "bead", kind: "count" },
  { id: "assignment_points_on_time", section: "bead", kind: "point" },
  { id: "has_theory_test_in_semester", section: "elmelet", kind: "yesno" },
  { id: "theory_test_pass_threshold", section: "elmelet", kind: "point" },
  { id: "has_retake", section: "potlas", kind: "yesno" },
  { id: "has_offered_exam_grade", section: "potlas", kind: "yesno" },
  { id: "final_total_max", section: "hatarok", kind: "point" },
  { id: "grade2_min_points", section: "hatarok", kind: "point" },
  { id: "grade3_min_points", section: "hatarok", kind: "point" },
  { id: "grade4_min_points", section: "hatarok", kind: "point" },
  { id: "grade5_min_points", section: "hatarok", kind: "point" },
];

/** The fields with their labels in `locale` (the form's order). */
export function surveyFields(locale: Locale = "hu"): FieldMeta[] {
  const t = getMessages(locale).rules.extract.survey;
  const options = t.options as Record<string, string>;
  return STRUCTURE.map((f) => ({
    id: f.id,
    label: t.fields[f.id],
    section: f.section,
    kind: f.kind,
    ...(f.options && { options: f.options.map((value) => ({ value, label: options[value] })) }),
  }));
}

/** The fields by id with their labels in `locale`. */
export function fieldMeta(locale: Locale = "hu"): Record<FieldId, FieldMeta> {
  return Object.fromEntries(surveyFields(locale).map((f) => [f.id, f])) as Record<FieldId, FieldMeta>;
}

/** Hungarian, for callers that have not been given a language yet (the language-free parts are what matter). */
export const SURVEY_FIELDS: FieldMeta[] = surveyFields("hu");
export const FIELD_META: Record<FieldId, FieldMeta> = fieldMeta("hu");

/** The form's sections; `presence` is the switch (or enum) whose "no" collapses the section. */
export function sections(locale: Locale = "hu"): { id: SectionId; title: string; presence?: FieldId }[] {
  const t = getMessages(locale).rules.extract.survey.sections;
  return [
    { id: "jegy", title: t.jegy },
    { id: "jelenlet", title: t.jelenlet, presence: "attendance_mandatory" },
    { id: "zh", title: t.zh, presence: "zh_scoring" },
    { id: "rop", title: t.rop, presence: "has_quick_tests" },
    { id: "bead", title: t.bead, presence: "has_assignment" },
    { id: "elmelet", title: t.elmelet, presence: "has_theory_test_in_semester" },
    { id: "potlas", title: t.potlas },
    { id: "hatarok", title: t.hatarok },
  ];
}
export const SECTIONS = sections("hu");

/** Is the part a presence field stands for there? (A null answer counts as there, so it stays open.) */
export function sectionOn(presence: FieldId, values: SurveyValues): boolean {
  const v = values[presence];
  if (presence === "zh_scoring") return v !== "no_zh";
  return v !== false;
}

type GatePhrase = keyof ReturnType<typeof getMessages>["rules"]["extract"]["survey"]["gatePhrases"];

interface Gate {
  gate: FieldId;
  open: (v: FieldValue) => boolean;
  /** Which phrase completes "Attól függ, hogy …" / "Depends on whether …" (dictionary key). */
  phrase: GatePhrase;
}

const isTrue = (v: FieldValue) => v === true;
const QUICK: Gate = { gate: "has_quick_tests", open: isTrue, phrase: "quick" };
const ASSIGN: Gate = { gate: "has_assignment", open: isTrue, phrase: "assignment" };
const ZH_EXIST: Gate = { gate: "zh_scoring", open: (v) => v !== "no_zh", phrase: "zhExists" };
const ZH_POINTS: Gate = { gate: "zh_scoring", open: (v) => v === "points", phrase: "zhPoints" };
/** Both point methods end in point limits: raw points, or component grades counted as points. */
export const POINT_BANDS = new Set<FieldValue>(["raw_points_to_bands", "component_grades_to_points"]);
const BANDS: Gate = {
  gate: "grade_calculation",
  open: (v) => POINT_BANDS.has(v),
  phrase: "bands",
};

/** A detail only counts if its structure answer says the part exists. */
export const GATES: Partial<Record<FieldId, Gate>> = {
  quick_test_count: QUICK,
  quick_test_total_max: QUICK,
  quick_test_min_points: QUICK,
  assignment_count: ASSIGN,
  assignment_points_on_time: ASSIGN,
  theory_test_pass_threshold: { gate: "has_theory_test_in_semester", open: isTrue, phrase: "theory" },
  zh_count: ZH_EXIST,
  zh_max_points: ZH_POINTS,
  zh_min_points: ZH_POINTS,
  max_absences: { gate: "attendance_mandatory", open: isTrue, phrase: "attendance" },
  final_total_max: BANDS,
  grade2_min_points: BANDS,
  grade3_min_points: BANDS,
  grade4_min_points: BANDS,
  grade5_min_points: BANDS,
};

/** The words completing "Attól függ, hogy …" for a gate, in `locale`. */
export function gatePhrase(gate: { phrase: GatePhrase }, locale: Locale = "hu"): string {
  return getMessages(locale).rules.extract.survey.gatePhrases[gate.phrase];
}

/** Is the field's gate open for these values? A field without a gate is always open; a missing gate answer is closed. */
export function gateOpen(id: FieldId, values: SurveyValues): boolean {
  const g = GATES[id];
  if (!g) return true;
  const v = values[g.gate];
  return v !== null && g.open(v);
}

/** The values with every detail whose gate is closed set to none. */
export function gatedValues(values: SurveyValues): SurveyValues {
  const out = { ...values };
  for (const id of FIELD_IDS) if (!gateOpen(id, values)) out[id] = null;
  return out;
}

export const asNumber = (v: FieldValue | undefined): NumberValue | null =>
  typeof v === "object" && v !== null ? v : null;
export const asCount = (v: FieldValue | undefined): number | null => (typeof v === "number" ? v : null);
export const asText = (v: FieldValue | undefined): string | null => (typeof v === "string" ? v : null);
