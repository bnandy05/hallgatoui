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

// The wording is the owner's tested prompt (October 2026: 113/115 right on five real documents
// before the app's reading rules). Change it only with a live run against the fixtures
// (`npm run jev:survey`) and keep `test/surveyRealAnswers.test.ts` green.

const NOUL: Partial<Record<FieldId, { instructions: string; criteria: { true: string; false: string } }>> = {
  attendance_mandatory: {
    instructions: "Does `document` state that attending classes is mandatory (a részvétel kötelező), or set a limit on absences?",
    criteria: {
      true: "Attendance is explicitly mandatory, or a maximum number of absences is given.",
      false: "The document only says how classes are held (e.g. in person) without making attendance a requirement.",
    },
  },
  has_quick_tests: {
    instructions:
      "Does the course in `document` have short recurring tests at the start of classes (röpzh, röpdolgozat, kis zh, beugró)?",
    criteria: {
      true: "There are short recurring in-class tests.",
      false: "There are no short recurring in-class tests; only larger zh-s, exams or assignments.",
    },
  },
  has_assignment: {
    instructions: "Does the course in `document` require submitting homework assignments or projects (beadandó, házi feladat)?",
    criteria: {
      true: "At least one assignment must be submitted and is evaluated.",
      false: "No assignment to submit is part of the requirements.",
    },
  },
  has_theory_test_in_semester: {
    instructions:
      "Does every student of the course in `document` write a separate theory test (elméleti zh / elméleti dolgozat) during the semester or at its end, apart from the exam?",
    criteria: {
      true: "A theory test is part of the regular semester requirements for all students.",
      false: "There is no such theory test, or it only applies to a special group of students.",
    },
  },
  has_retake: {
    instructions: "Does `document` offer a retake or make-up for a failed or missed zh (pótzh, javító zh, pótlás)?",
    criteria: {
      true: "A make-up or retake of a zh is offered.",
      false: "No zh retake or make-up is described.",
    },
  },
  has_offered_exam_grade: {
    instructions:
      "Can a student earn an offered exam grade (megajánlott jegy / megajánlott vizsgajegy) through semester work in `document`?",
    criteria: {
      true: "An offered exam grade is possible.",
      false: "No offered exam grade is described.",
    },
  },
};

const ENUM: Partial<Record<FieldId, { instructions: string; criteria: Criteria }>> = {
  grade_types: {
    instructions: "Which final grades does a student have to earn in the course described in `document`?",
    criteria: {
      practice_grade_only: "Only a practical grade (gyakorlati jegy). No separate exam grade (vizsgajegy / kollokvium) is described.",
      exam_only: "Only an exam grade (vizsgajegy / kollokvium). No practical grade.",
      practice_and_exam: "Both a practical grade (gyakorlati jegy) and a separate exam grade (vizsgajegy).",
      unclear: "The document does not make this clear.",
    },
  },
  zh_scoring: {
    instructions:
      "How are the practical/midterm tests (zh, zárthelyi, gépes zh, dolgozat) of the course in `document` scored? Ignore the theory test and quick tests.",
    criteria: {
      points: "Each zh earns a numeric point score, possibly with a minimum score to pass.",
      grade_1_5: "Each zh gets a 1-5 grade (ötfokozatú skála) rather than a point score.",
      pass_fail: "Each zh is only passed or failed, with no points or grade.",
      no_zh: "The course has no zh.",
      not_described: "The document does not say how zh-s are scored.",
    },
  },
  grade_calculation: {
    instructions: "How is the practical grade (gyakorlati jegy) calculated in `document`?",
    criteria: {
      raw_points_to_bands:
        "Points earned on tests are added up (possibly with a formula) and the total is converted to a grade with point ranges.",
      component_grades_to_points:
        "Components first get their own 1-5 grades, these are counted as points (some with double weight), and the sum is converted to a grade with point ranges.",
      average_of_grades: "The practical grade is a plain average of component grades.",
      other: "Some other method.",
      not_described: "The document does not describe how the practical grade is calculated.",
    },
  },
};

const COUNT: Partial<Record<FieldId, { instructions: string; none: string }>> = {
  zh_count: {
    instructions:
      "How many practical/midterm tests (zh, zárthelyi, gépes zh, dolgozat) must students write during the semester in `document`? Do not count the theory test, retakes or quick tests.",
    none: "The document does not say how many zh-s there are.",
  },
  quick_test_count: {
    instructions: "How many short in-class quick tests (röpzh / röpdolgozat) are written during the semester in `document`?",
    none: "There are no quick tests, or their number is not stated.",
  },
  assignment_count: {
    instructions: "How many assignments (beadandó) must be submitted in `document`?",
    none: "There are no assignments, or their number is not stated.",
  },
};

const POINT: Partial<Record<FieldId, { instructions: string; none: string }>> = {
  max_absences: {
    instructions: "What is the maximum number of absences (hiányzás) allowed in `document`?",
    none: "No maximum number of absences is given (for example only a minimum attendance percentage, or nothing).",
  },
  zh_max_points: {
    instructions: "What is the maximum number of points a single zh is worth in `document`?",
    none: "The zh-s are not scored in points (e.g. they get a 1-5 grade), or the maximum is not stated.",
  },
  zh_min_points: {
    instructions: "What is the minimum number of points needed for a single zh to count as passed (sikeres) in `document`?",
    none: "The pass condition of a zh is not given in points (e.g. it is a grade of at least 2), or it is not stated.",
  },
  quick_test_total_max: {
    instructions:
      "What is the maximum total number of points that can be collected on all quick tests (röpzh / röpdolgozat) together in `document`?",
    none: "There are no quick tests, or this is not stated.",
  },
  quick_test_min_points: {
    instructions:
      "What is the minimum number of quick-test points (in each required part) needed for the quick-test part to be successful in `document`?",
    none: "There are no quick tests, or no minimum is stated.",
  },
  assignment_points_on_time: {
    instructions: "How many points is an assignment (beadandó) worth if it is submitted on time and accepted in `document`?",
    none: "Assignments are not scored in points, or there are none.",
  },
  theory_test_pass_threshold: {
    instructions:
      "In the in-semester theory test (elméleti zh) of `document`, what is the minimum number of points or correct answers for a passing (elégséges) result?",
    none: "There is no in-semester theory test, or its pass threshold is not stated.",
  },
  final_total_max: {
    instructions: "What is the highest possible total score (the top of the jeles band) used to calculate the practical grade in `document`?",
    none: "The practical grade is not based on a point total, or the maximum is not stated.",
  },
  grade2_min_points: {
    instructions: "What is the minimum total score for an elégséges (2) practical grade in `document`?",
    none: "No point range for elégséges (2) is given.",
  },
  grade3_min_points: {
    instructions: "What is the minimum total score for a közepes (3) practical grade in `document`?",
    none: "No point range for közepes (3) is given.",
  },
  grade4_min_points: {
    instructions: "What is the minimum total score for a jó (4) practical grade in `document`?",
    none: "No point range for jó (4) is given.",
  },
  grade5_min_points: {
    instructions: "What is the minimum total score for a jeles (5) practical grade in `document`?",
    none: "No point range for jeles (5) is given.",
  },
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

export function countCriteria(none = "The document states no such count, or there are none."): Criteria {
  const out: Criteria = { none };
  COUNT_WORDS.forEach((w, i) => (out[`n${i + 1}`] = `${i + 1} (${w})`));
  return out;
}

export function pointCriteria(candidates: Candidate[], none = "The document states no such number."): Criteria {
  const out: Criteria = { none };
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
      questions[id] = { type: "noul", instructions: q.instructions, criteria: q.criteria };
    } else if (kind === "enum") {
      const q = ENUM[id]!;
      questions[id] = { type: "choice", instructions: q.instructions, criteria: q.criteria };
    } else if (kind === "count") {
      const q = COUNT[id]!;
      questions[id] = { type: "choice", instructions: q.instructions, criteria: countCriteria(q.none) };
    } else {
      const q = POINT[id]!;
      questions[id] = { type: "choice", instructions: q.instructions, criteria: pointCriteria(candidates, q.none) };
    }
  }
  const name = course.code ? `${course.name} (${course.code})` : course.name;
  return {
    body: { model: SURVEY_MODEL, state: { course: name, document }, questions },
    candidates,
    truncated: text.length > SURVEY_MAX_DOC_CHARS,
  };
}

