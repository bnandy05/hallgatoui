// The survey reading of a requirements document: Jev answers 24 typed questions about the whole
// text in one request, code finds the numbers and applies gates and review flags, the student
// confirms every flagged field, and the confirmed form becomes rules.

export { numberCandidates, MAX_CANDIDATES, type Candidate } from "./candidates";
export {
  FIELD_IDS,
  FIELD_META,
  GATES,
  SECTIONS,
  SURVEY_FIELDS,
  gateOpen,
  gatedValues,
  sectionOn,
  type FieldId,
  type FieldKind,
  type FieldMeta,
  type FieldValue,
  type NumberValue,
  type SectionId,
  type SurveyValues,
} from "./fields";
export { buildSurveyRequest, SURVEY_MAX_DOC_CHARS, SURVEY_MODEL, type SurveyBody, type SurveyQuestion } from "./questions";
export {
  CHOICE_REVIEW_BELOW,
  NOUL_REVIEW_BAND,
  UP_TO_REASON,
  componentTotal,
  consistency,
  emptySurvey,
  readSurvey,
  surveyValues,
  type Field,
  type RawAnswer,
  type SurveyDraft,
} from "./read";
export { surveyRules, CANNOT_WRITE_GRADE } from "./rules";
export { expectedValues, matchesExpected, scoreSurvey, type Expected, type Score } from "./expected";
export { answerValue } from "./read";
