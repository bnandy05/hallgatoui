// The survey request: 24 typed questions about one document, all independent, sent to Jev in one
// call. Jev picks, code builds: structure questions are Noul/Choice over fixed labels, counts are
// Choices over n1…n15 + none, numbers are Choices over the candidates code found in the text + none.
// Question names are only for code (the model never sees them as meaning), so every instruction
// is self-contained and refers to the state fields `course` and `document`.

import { numberCandidates, type Candidate } from "./candidates";
import { FIELD_META, FIELD_IDS, type FieldId } from "./fields";

export const SURVEY_MODEL = "jev-latest";
export const SURVEY_MAX_DOC_CHARS = 40_000;

type Criteria = Record<string, string | null>;
export interface SurveyQuestion {
  type: "noul" | "choice";
  instructions: string;
  criteria?: Criteria;
}

export interface SurveyBody {
  model: string;
  state: { course: string; document: string };
  questions: Record<string, SurveyQuestion>;
}

const TESTS = "main written tests (zárthelyi, zh, nagyzh, dolgozat; not röpzh, kvíz or other short tests)";

const NOUL: Partial<Record<FieldId, { instructions: string; criteria?: { true: string; false: string } }>> = {
  attendance_mandatory: {
    instructions:
      "Does `document` make attendance at the classes of `course` compulsory, with a limit on absences beyond which the student fails or gets no grade?",
    criteria: {
      true: "Yes: attendance is compulsory with a stated absence limit or minimum attendance (e.g. 'legfeljebb 3 hiányzás', 'a foglalkozások 70%-án részt kell venni').",
      false:
        "No: attendance is not compulsory, the limit only applies to some special sessions such as certain labs, or the document says nothing about it.",
    },
  },
  has_quick_tests: {
    instructions:
      "Besides the main written tests, does `course` have a series of short tests during the semester (röpzh, röpdolgozat, kiszh, beugró, kvíz, short online tests) that count towards the result, according to `document`?",
  },
  has_assignment: {
    instructions:
      "Does `course` have assignments that the student submits and that count towards the result (beadandó, házi feladat, projekt, programozási feladat), according to `document`?",
  },
  has_theory_test_in_semester: {
    instructions:
      "During the teaching weeks of the semester, does `course` have a separate theory test (elméleti zh, elméleti teszt, definíciók és tételek számonkérése) that the student must pass, according to `document`? Answer no if theory is only tested as part of the final exam, kollokvium or szigorlat, even if that exam has a written theory part.",
  },
  has_retake: {
    instructions:
      "According to `document`, can the student of `course` retake or improve the main written tests of the semester (pótzh, javító zh, pótló dolgozat)?",
  },
  has_offered_exam_grade: {
    instructions:
      "According to `document`, can a student of `course` get an offered exam grade (megajánlott jegy) based on the semester's work, without taking the exam?",
  },
};

const ENUM: Partial<Record<FieldId, { instructions: string; criteria: Criteria }>> = {
  grade_types: {
    instructions: "According to `document`, which grades does a student of `course` receive?",
    criteria: {
      practice_grade_only: "Only a term/practice grade (gyakorlati jegy, évközi jegy, folyamatos számonkérés); there is no exam.",
      exam_only:
        "Only an exam grade (kollokvium, vizsga, szigorlat); work during the semester at most qualifies the student for the exam.",
      practice_and_exam: "Two separate grades: a practice grade for the semester's work and a separate exam grade.",
      unclear: "The document does not make this clear.",
    },
  },
  zh_scoring: {
    instructions: `How are the ${TESTS} of \`course\` assessed in \`document\`?`,
    criteria: {
      points: "Each test is scored in points (or percent).",
      grade_1_5: "Each test gets a grade from 1 to 5.",
      pass_fail: "Each test is only passed or failed (megfelelt / nem felelt meg).",
      no_zh: "The course has no main written tests during the semester.",
      not_described: "There are such tests but the document does not say how they are assessed.",
    },
  },
  grade_calculation: {
    instructions:
      "How is the grade of `course` (the practice grade, or the exam grade if there is no practice grade) computed from the results in `document`?",
    criteria: {
      raw_points_to_bands: "The points of the components are added up and point or percentage limits give the grade.",
      component_grades_to_points:
        "Each component first gets its own grade, which is converted into points or weighted before the final grade is computed.",
      average_of_grades: "Each component gets a grade from 1 to 5 and the final grade is their (possibly weighted) average.",
      other: "Another method.",
      not_described: "The document does not say.",
    },
  },
};

const COUNT: Partial<Record<FieldId, string>> = {
  zh_count: `How many ${TESTS} does a student of \`course\` write during the semester according to \`document\`? Count each regular test once; do not count retakes (pótzh, javító zh). Choose 'none' if there are none.`,
  quick_test_count:
    "How many short tests (röpzh, röpdolgozat, kiszh, beugró, kvíz) does a student of `course` write during the semester according to `document`? Choose 'none' if their number is not stated or there are none.",
  assignment_count:
    "How many assignments (beadandó, házi feladat, projekt) must a student of `course` submit according to `document`? Choose 'none' if their number is not stated or there are none.",
};

const GRADE_NAMES: Record<number, string> = { 2: "elégséges = 2", 3: "közepes = 3", 4: "jó = 4", 5: "jeles = 5" };
const gradeLimit = (g: number) =>
  `What is the lowest total score or percentage that earns grade ${g} (${GRADE_NAMES[g]}) in \`course\` according to \`document\`? If the document gives a range for this grade, choose the range or its lower end.`;

const POINT: Partial<Record<FieldId, string>> = {
  max_absences:
    "How many absences from the classes of `course` does `document` allow at most? Choose 'none' if no number of absences is stated (for example when only a minimum attendance percentage is given).",
  zh_max_points:
    "What is the maximum score of ONE main written test (zárthelyi, zh) of `course` in `document`? Not the total of all tests, and not a short test (röpzh, kvíz).",
  zh_min_points:
    "What minimum score must the student reach on EACH main written test (zárthelyi, zh) of `course` according to `document`? Choose 'none' if there is no per-test minimum.",
  quick_test_total_max:
    "What is the maximum total score of ALL short tests (röpzh, kvíz, kiszh) of `course` together, according to `document`?",
  quick_test_min_points:
    "What minimum total score must the student collect from the short tests (röpzh, kvíz, kiszh) of `course` according to `document`? Choose 'none' if there is no such minimum.",
  assignment_points_on_time:
    "How many points is ONE assignment (beadandó, házi feladat) of `course` worth when submitted on time, according to `document`?",
  theory_test_pass_threshold:
    "What score or percentage must the student reach to pass the theory test held during the semester (elméleti zh, elméleti teszt) of `course`, according to `document`? Choose 'none' if no such threshold is stated.",
  final_total_max:
    "What is the maximum total score from which the grade of `course` is computed, according to `document`?",
  grade2_min_points: gradeLimit(2),
  grade3_min_points: gradeLimit(3),
  grade4_min_points: gradeLimit(4),
  grade5_min_points: gradeLimit(5),
};

const COUNT_WORDS = [
  "egy",
  "két, kettő",
  "három",
  "négy",
  "öt",
  "hat",
  "hét",
  "nyolc",
  "kilenc",
  "tíz",
  "tizenegy",
  "tizenkettő",
  "tizenhárom",
  "tizennégy",
  "tizenöt",
];

/** n1…n15, as the count questions' labels. */
export const COUNT_LABELS = COUNT_WORDS.map((_, i) => `n${i + 1}`);

export function countCriteria(): Criteria {
  const out: Criteria = { none: "The document states no such count, or there are none." };
  COUNT_WORDS.forEach((w, i) => (out[`n${i + 1}`] = `${i + 1} (${w})`));
  return out;
}

export function pointCriteria(candidates: Candidate[]): Criteria {
  const out: Criteria = { none: "The document states no such number." };
  for (const c of candidates) out[c.id] = c.text;
  return out;
}

export function buildSurveyRequest(
  text: string,
  course: { name: string; code?: string }
): { body: SurveyBody; candidates: Candidate[]; truncated: boolean } {
  const document = text.slice(0, SURVEY_MAX_DOC_CHARS);
  const candidates = numberCandidates(document);
  const questions: Record<string, SurveyQuestion> = {};
  for (const id of FIELD_IDS) {
    const kind = FIELD_META[id].kind;
    if (kind === "yesno") {
      const q = NOUL[id]!;
      questions[id] = { type: "noul", instructions: q.instructions, ...(q.criteria && { criteria: q.criteria }) };
    } else if (kind === "enum") {
      const q = ENUM[id]!;
      questions[id] = { type: "choice", instructions: q.instructions, criteria: q.criteria };
    } else if (kind === "count") {
      questions[id] = { type: "choice", instructions: COUNT[id]!, criteria: countCriteria() };
    } else {
      questions[id] = { type: "choice", instructions: POINT[id]!, criteria: pointCriteria(candidates) };
    }
  }
  const name = course.code ? `${course.name} (${course.code})` : course.name;
  return {
    body: { model: SURVEY_MODEL, state: { course: name, document }, questions },
    candidates,
    truncated: text.length > SURVEY_MAX_DOC_CHARS,
  };
}

