// The owner's expected answers for a document (`{ "<question id>": true | false | "<label>" |
// <number> | "none" }`, fixtures/kovetelmeny/<name>/survey.json): used by the tests and by the
// eval script. Pure.

import type { Candidate } from "./candidates";
import { FIELD_IDS, FIELD_META, type FieldId, type FieldValue, type SurveyValues } from "./fields";
import { answerValue, type SurveyDraft } from "./read";

export type Expected = Partial<Record<FieldId, boolean | string | number>>;

/** Does a field value say what the expected answer says? */
export function matchesExpected(value: FieldValue, expected: boolean | string | number): boolean {
  if (expected === "none") return value === null;
  if (typeof expected === "number") {
    if (typeof value === "number") return value === expected;
    return typeof value === "object" && value !== null && Math.abs(value.value - expected) < 1e-9;
  }
  return value === expected;
}

/** The expected answers as form values (numbers are points; a student's percent would be explicit). */
export function expectedValues(expected: Expected): SurveyValues {
  const out = {} as SurveyValues;
  for (const id of FIELD_IDS) {
    const e = expected[id];
    const kind = FIELD_META[id].kind;
    out[id] = e === undefined || e === "none" ? null : kind === "point" && typeof e === "number" ? { value: e, percent: false } : e;
  }
  return out;
}

export interface Score {
  total: number;
  raw: number; // right before gates and flags
  after: number; // right after gates (hidden fields count as none)
  wrongUnflagged: number; // wrong after the rules and not flagged: the number that must stay at zero
}

export function scoreSurvey(draft: SurveyDraft, expected: Expected, candidates: Candidate[]): Score {
  const score: Score = { total: 0, raw: 0, after: 0, wrongUnflagged: 0 };
  for (const id of FIELD_IDS) {
    const e = expected[id];
    if (e === undefined) continue;
    score.total++;
    const a = draft.raw[id];
    if (a && matchesExpected(answerValue(id, a, candidates).value, e)) score.raw++;
    const f = draft.fields[id];
    const right = matchesExpected(f.hidden ? null : f.value, e);
    if (right) score.after++;
    else if (!f.flagged) score.wrongUnflagged++;
  }
  return score;
}
