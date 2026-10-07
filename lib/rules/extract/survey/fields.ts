// The survey's fields: one per question Jev answers, with what the form needs (Hungarian label,
// section, kind, enum options) and the gates that tie a detail to the structure answer saying the
// part exists. Pure; shared by the question builder, the reader, the rules builder and the form.

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
  label: string; // Hungarian, for the form
  section: SectionId;
  kind: FieldKind;
  options?: { value: string; label: string }[]; // enum labels, as the question's criteria keys
}

export const MAX_COUNT = 15;

export const SURVEY_FIELDS: FieldMeta[] = [
  {
    id: "grade_types",
    label: "Milyen jegyet kap a hallgató?",
    section: "jegy",
    kind: "enum",
    options: [
      { value: "practice_grade_only", label: "Csak gyakorlati jegyet (nincs vizsga)" },
      { value: "exam_only", label: "Csak vizsgajegyet (a félévi munka a vizsgához kell)" },
      { value: "practice_and_exam", label: "Gyakorlati jegyet és külön vizsgajegyet" },
      { value: "unclear", label: "Nem egyértelmű" },
    ],
  },
  {
    id: "grade_calculation",
    label: "Hogyan számolják ki a jegyet?",
    section: "jegy",
    kind: "enum",
    options: [
      { value: "raw_points_to_bands", label: "A pontokat összeadják, ponthatárok adják a jegyet" },
      { value: "component_grades_to_points", label: "Az összetevők jegyét előbb pontra váltják" },
      { value: "average_of_grades", label: "Az összetevők jegyeinek átlaga" },
      { value: "other", label: "Más módszer" },
      { value: "not_described", label: "A dokumentum nem írja le" },
    ],
  },
  { id: "attendance_mandatory", label: "Kötelező a jelenlét, hiányzási határral", section: "jelenlet", kind: "yesno" },
  { id: "max_absences", label: "Legfeljebb hány hiányzás megengedett?", section: "jelenlet", kind: "point" },
  {
    id: "zh_scoring",
    label: "Hogyan értékelik a zárthelyiket?",
    section: "zh",
    kind: "enum",
    options: [
      { value: "points", label: "Pontszámmal (vagy százalékkal)" },
      { value: "grade_1_5", label: "Jeggyel (1–5)" },
      { value: "pass_fail", label: "Megfelelt / nem felelt meg" },
      { value: "no_zh", label: "Nincs zárthelyi a félévben" },
      { value: "not_described", label: "A dokumentum nem írja le" },
    ],
  },
  { id: "zh_count", label: "Hány zárthelyit írnak?", section: "zh", kind: "count" },
  { id: "zh_max_points", label: "Egy zárthelyi maximális pontszáma", section: "zh", kind: "point" },
  { id: "zh_min_points", label: "Minimum zárthelyinként", section: "zh", kind: "point" },
  { id: "has_quick_tests", label: "Vannak röpzh-k vagy kvízek", section: "rop", kind: "yesno" },
  { id: "quick_test_count", label: "Hány röpzh vagy kvíz van?", section: "rop", kind: "count" },
  { id: "quick_test_total_max", label: "Az összes röpzh együtt legfeljebb", section: "rop", kind: "point" },
  { id: "quick_test_min_points", label: "Minimum a röpzh-kból összesen", section: "rop", kind: "point" },
  { id: "has_assignment", label: "Vannak beadandók", section: "bead", kind: "yesno" },
  { id: "assignment_count", label: "Hány beadandót kell leadni?", section: "bead", kind: "count" },
  { id: "assignment_points_on_time", label: "Egy határidőre leadott beadandó pontja", section: "bead", kind: "point" },
  { id: "has_theory_test_in_semester", label: "Van elméleti teszt a félév közben", section: "elmelet", kind: "yesno" },
  { id: "theory_test_pass_threshold", label: "Az elméleti teszt sikeres eredménye", section: "elmelet", kind: "point" },
  { id: "has_retake", label: "A zh-k pótolhatók vagy javíthatók", section: "potlas", kind: "yesno" },
  { id: "has_offered_exam_grade", label: "Kapható megajánlott vizsgajegy", section: "potlas", kind: "yesno" },
  { id: "final_total_max", label: "A jegy alapjául szolgáló legnagyobb összpontszám", section: "hatarok", kind: "point" },
  { id: "grade2_min_points", label: "Elégséges (2) legalacsonyabb határa", section: "hatarok", kind: "point" },
  { id: "grade3_min_points", label: "Közepes (3) legalacsonyabb határa", section: "hatarok", kind: "point" },
  { id: "grade4_min_points", label: "Jó (4) legalacsonyabb határa", section: "hatarok", kind: "point" },
  { id: "grade5_min_points", label: "Jeles (5) legalacsonyabb határa", section: "hatarok", kind: "point" },
];

export const FIELD_META: Record<FieldId, FieldMeta> = Object.fromEntries(SURVEY_FIELDS.map((f) => [f.id, f])) as Record<
  FieldId,
  FieldMeta
>;

/** The form's sections; `presence` is the switch (or enum) whose "no" collapses the section. */
export const SECTIONS: { id: SectionId; title: string; presence?: FieldId }[] = [
  { id: "jegy", title: "Jegy" },
  { id: "jelenlet", title: "Jelenlét", presence: "attendance_mandatory" },
  { id: "zh", title: "Zárthelyik", presence: "zh_scoring" },
  { id: "rop", title: "Röpzh-k és kvízek", presence: "has_quick_tests" },
  { id: "bead", title: "Beadandók", presence: "has_assignment" },
  { id: "elmelet", title: "Elméleti teszt", presence: "has_theory_test_in_semester" },
  { id: "potlas", title: "Pótlás és megajánlott jegy" },
  { id: "hatarok", title: "Ponthatárok" },
];

/** Is the part a presence field stands for there? (A null answer counts as there, so it stays open.) */
export function sectionOn(presence: FieldId, values: SurveyValues): boolean {
  const v = values[presence];
  if (presence === "zh_scoring") return v !== "no_zh";
  return v !== false;
}

interface Gate {
  gate: FieldId;
  open: (v: FieldValue) => boolean;
  /** Completes "Attól függ, hogy …". */
  phrase: string;
}

const isTrue = (v: FieldValue) => v === true;
const QUICK: Gate = { gate: "has_quick_tests", open: isTrue, phrase: "vannak-e röpzh-k vagy kvízek" };
const ASSIGN: Gate = { gate: "has_assignment", open: isTrue, phrase: "vannak-e beadandók" };
const ZH_EXIST: Gate = { gate: "zh_scoring", open: (v) => v !== "no_zh", phrase: "van-e zárthelyi a félévben" };
const ZH_POINTS: Gate = { gate: "zh_scoring", open: (v) => v === "points", phrase: "pontszámmal értékelik-e a zárthelyiket" };
const BANDS: Gate = {
  gate: "grade_calculation",
  open: (v) => v === "raw_points_to_bands",
  phrase: "ponthatárok adják-e a jegyet",
};

/** A detail only counts if its structure answer says the part exists. */
export const GATES: Partial<Record<FieldId, Gate>> = {
  quick_test_count: QUICK,
  quick_test_total_max: QUICK,
  quick_test_min_points: QUICK,
  assignment_count: ASSIGN,
  assignment_points_on_time: ASSIGN,
  theory_test_pass_threshold: { gate: "has_theory_test_in_semester", open: isTrue, phrase: "van-e elméleti teszt a félév közben" },
  zh_count: ZH_EXIST,
  zh_max_points: ZH_POINTS,
  zh_min_points: ZH_POINTS,
  max_absences: { gate: "attendance_mandatory", open: isTrue, phrase: "kötelező-e a jelenlét" },
  final_total_max: BANDS,
  grade2_min_points: BANDS,
  grade3_min_points: BANDS,
  grade4_min_points: BANDS,
  grade5_min_points: BANDS,
};

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
