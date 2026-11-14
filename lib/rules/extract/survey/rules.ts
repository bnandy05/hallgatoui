// The confirmed survey form → SubjectRules. Pure. Nothing is guessed silently: every assumption
// becomes an "Ellenőrizd" rule flag (a stable code, shown in the reader's language), and a form
// that cannot be written as rules gives errors in the UI language instead (the same all-or-nothing rule as the parser: a result that fails validation is
// never saved).

import { getMessages, type Locale } from "@/lib/i18n";
import { flagFor, type FlagCode } from "../../flags";
import type {
  AssignmentComponent,
  Derived,
  ExamComponent,
  Gate,
  Outcome,
  RuleComponent,
  RuleFlag,
  SeriesComponent,
  SubjectRules,
} from "../../types";
import { validateRules } from "../../validate";
import { semanticErrors } from "../semantic";
import { GRADE_LIMIT_FIELDS, asCount, asNumber, asText, gatedValues, type FieldValue, type NumberValue, type SurveyValues } from "./fields";

/** The Hungarian text; `surveyRules` returns the text of the language it was asked in. */
export const CANNOT_WRITE_GRADE = getMessages("hu").rules.extract.survey.errors.cannotWriteGrade;

/** A number as shown: rounded to 4 decimals (the dictionary adds the decimal comma). */
const fmt = (n: number) => Math.round(n * 1e4) / 1e4;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => String(Math.round(n * 1e6) / 1e6);

type SurveyText = ReturnType<typeof getMessages>["rules"]["extract"]["survey"];

interface Built {
  flags: RuleFlag[];
  errors: string[];
}
const flag = (b: Built, field: string, code: FlagCode, ...args: (string | number)[]) => b.flags.push(flagFor(field, code, ...args));

/** A points value; a percent where points belong is read as points, with a flag. */
function points(b: Built, v: FieldValue, field: string, what: "zhMax" | "quickTotal" | "assignment"): number | null {
  const n = asNumber(v);
  if (!n) return null;
  if (n.percent) flag(b, field, "percentAsPoints", what, fmt(n.value));
  return n.value;
}

/**
 * The grade by point limits over `terms`: the summed points become `ossz`, the four limits (points,
 * or percents of the stated total, else of the sum) a table. Null with an error when it cannot.
 */
function pointBands(
  b: Built,
  v: SurveyValues,
  terms: { expr: string; max: number }[],
  derived: Derived[],
  tables: SubjectRules["tables"],
  t: SurveyText
): string | null {
  const sum = terms.reduce((s, t) => s + t.max, 0);
  const limits = GRADE_LIMIT_FIELDS.map((f) => asNumber(v[f]));
  if (limits.some((l) => l === null)) b.errors.push(t.errors.limitsAll);
  else if (limits.some((l) => l!.percent) && limits.some((l) => !l!.percent)) b.errors.push(t.errors.limitsMixed);
  else if (terms.length > 0) {
    const stated = asNumber(v.final_total_max);
    const total = stated && !stated.percent ? stated.value : sum;
    const rows: { min: number; value: number }[] = [];
    limits.forEach((l, i) => rows.push({ min: l!.percent ? round2((l!.value / 100) * total) : l!.value, value: i + 2 }));
    // Below the lowest limit is 1; a lowest limit of 0 leaves nothing below it.
    if (rows[0].min > 0) rows.unshift({ min: 0, value: 1 });
    tables.push({ id: "jegy", rows });
    derived.push({ id: "ossz", label: t.labels.total(fmt(sum)), expr: terms.map((t) => t.expr).join(" + ") });
    return "table(jegy, ossz)";
  }
  return null;
}

/** A minimum given in points or as a percent of `of`. */
function minimum(v: NumberValue | null, of: number): number | null {
  if (!v) return null;
  return v.percent ? round2((v.value / 100) * of) : v.value;
}

export function surveyRules(input: SurveyValues, locale: Locale = "hu"): { rules: SubjectRules | null; errors: string[] } {
  const t = getMessages(locale).rules.extract.survey;
  const L = t.labels;
  const E = t.errors;
  const v = gatedValues(input);
  const b: Built = { flags: [], errors: [] };
  const components: RuleComponent[] = [];
  const retakes: SubjectRules["retakes"] = [];
  const derived: Derived[] = [];
  const tables: SubjectRules["tables"] = [];
  const outcomes: Outcome[] = [];

  const types = asText(v.grade_types);
  if (!types) return { rules: null, errors: [E.gradeTypes] };
  const calc = asText(v.grade_calculation);
  const examOnly = types === "exam_only";
  // Grades counted as points: every 1–5 grade (zh, theory test) is added to the points.
  const gradesAsPoints = !examOnly && calc === "component_grades_to_points";

  // ----- attendance -----
  if (v.attendance_mandatory === true) {
    const max = asCount(v.max_absences) ?? (asNumber(v.max_absences)?.percent ? null : asNumber(v.max_absences)?.value ?? null);
    components.push({
      id: "jelen",
      label: L.attendance,
      kind: "attendance",
      ...(max !== null && { limit: { maxAbsences: max, countExcused: true, onExceed: "none" as const } }),
    });
    if (max !== null) flag(b, "jelen", "attendanceAssumed");
    else flag(b, "jelen", "absenceLimitUnknown");
    if (examOnly) flag(b, "jelen", "attendanceExamOnly");
  }

  // ----- zh -----
  const zhIds: string[] = [];
  const zhGates: Gate[] = [];
  const terms: { expr: string; max: number }[] = [];
  const scoring = asText(v.zh_scoring);
  const gradeZh = scoring === "grade_1_5";
  if (scoring !== null && scoring !== "no_zh") {
    const count = asCount(v.zh_count);
    if (count === null) b.errors.push(E.zhCount);
    else {
      const labelOf = (i: number) => (count === 1 ? L.zhOne : L.zhNth(i));
      const max = scoring === "points" || scoring === "pass_fail" ? (scoring === "points" ? points(b, v.zh_max_points, "zh", "zhMax") : 1) : null;
      const min = scoring === "points" && max !== null ? minimum(asNumber(v.zh_min_points), max) : null;
      if (scoring === "points" && max === null) b.errors.push(E.zhMax);
      if (scoring === "not_described") b.errors.push(E.zhScoring);
      if (scoring === "pass_fail") flag(b, "zh", "passFailZh");
      for (let i = 1; i <= count && (scoring === "grade_1_5" || max !== null); i++) {
        const id = `zh${i}`;
        const scale: ExamComponent["scale"] =
          scoring === "grade_1_5"
            ? { kind: "grade" }
            : scoring === "pass_fail"
              ? { kind: "points", max: 1, passAt: 1 }
              : { kind: "points", max: max!, ...(min !== null && { passAt: min }) };
        components.push({ id, label: labelOf(i), kind: "exam", scale });
        zhIds.push(id);
        if (scoring === "points") terms.push({ expr: id, max: max! });
        if (min !== null) zhGates.push({ id: `min_${id}`, label: L.zhMin(labelOf(i), fmt(min)), test: `${id} >= ${num(min)}`, onFail: "fail" });
        if (scoring === "pass_fail") zhGates.push({ id: `min_${id}`, label: L.zhPass(labelOf(i)), test: `${id} >= 1`, onFail: "fail" });
        if (gradeZh && gradesAsPoints) zhGates.push({ id: `min_${id}`, label: L.zhGradeAtLeast(labelOf(i)), test: `${id} >= 2`, onFail: "fail" });
      }
      if (gradeZh && gradesAsPoints && zhGates.length > 0) flag(b, "zh", "zhAtLeastPass");
    }
  }

  // ----- short tests -----
  const quickGates: Gate[] = [];
  if (v.has_quick_tests === true) {
    const total = points(b, v.quick_test_total_max, "ropzh", "quickTotal");
    if (total === null) b.errors.push(E.quickTotal);
    else {
      const known = asCount(v.quick_test_count);
      const count = known ?? 1;
      const perItem = round2(total / count);
      if (known === null) flag(b, "ropzh", "quickCountUnknown");
      else if (!Number.isInteger(total / count)) flag(b, "ropzh", "quickNotDivisible", fmt(total), count, fmt(perItem));
      const series: SeriesComponent = {
        id: "ropzh",
        label: L.quick,
        kind: "series",
        item: "ropzh",
        count,
        scoring: { kind: "points", max: perItem },
      };
      components.push(series);
      terms.push({ expr: "ropzh", max: round2(perItem * count) });
      const min = minimum(asNumber(v.quick_test_min_points), total);
      if (min !== null) quickGates.push({ id: "min_ropzh", label: L.quickMin(fmt(min)), test: `ropzh >= ${num(min)}`, onFail: "fail" });
    }
  }

  // ----- assignments -----
  const assignGates: Gate[] = [];
  if (v.has_assignment === true) {
    const pts = points(b, v.assignment_points_on_time, "beadando", "assignment");
    if (pts === null) b.errors.push(E.assignmentPoints);
    else {
      const known = asCount(v.assignment_count);
      const count = known ?? 1;
      if (known === null) flag(b, "beadando", "assignmentCountUnknown");
      const ids: string[] = [];
      for (let i = 1; i <= count; i++) {
        const id = `beadando${i}`;
        const c: AssignmentComponent = {
          id,
          label: count === 1 ? L.assignmentOne : L.assignmentNth(i),
          kind: "assignment",
          outcomes: [
            { id: "ok", label: L.onTime, points: pts, accepted: true },
            { id: "nem", label: L.notAccepted, points: 0, accepted: false },
          ],
        };
        components.push(c);
        ids.push(id);
        terms.push({ expr: id, max: pts });
      }
      assignGates.push({ id: "bead", label: count === 1 ? L.assignmentGateOne : L.assignmentGateAll, test: `count(failed, ${ids.join(", ")}) == 0`, onFail: "none" });
      flag(b, "beadando", "assignmentAllAccepted");
    }
  }

  // ----- theory test during the semester -----
  const theoryGates: Gate[] = [];
  let theoryGrade = false;
  if (v.has_theory_test_in_semester === true && gradesAsPoints) {
    // Its 1–5 grade is what counts; the threshold in points is where the "elégséges" starts.
    const th = asNumber(v.theory_test_pass_threshold);
    components.push({ id: "elmelet", label: L.theory, kind: "exam", scale: { kind: "grade" } });
    theoryGrade = true;
    theoryGates.push({ id: "elmelet", label: L.theoryAtLeastPass, test: "elmelet >= 2", onFail: "fail" });
    if (th) flag(b, "elmelet", "theoryGradeThreshold", fmt(th.value), th.percent ? 1 : 0);
    else flag(b, "elmelet", "theoryGradeNoThreshold");
  } else if (v.has_theory_test_in_semester === true) {
    const th = asNumber(v.theory_test_pass_threshold);
    components.push({
      id: "elmelet",
      label: L.theory,
      kind: "exam",
      scale: { kind: "points", max: 100, ...(th && { passAt: th.value }) },
    });
    if (th) {
      theoryGates.push({ id: "elmelet", label: L.theoryAtLeast(fmt(th.value), th.percent), test: `elmelet >= ${num(th.value)}`, onFail: "fail" });
      if (!th.percent) flag(b, "elmelet", "theoryMaxAssumed");
    } else {
      flag(b, "elmelet", "theoryThresholdMissing");
    }
  }

  // ----- retakes and offered grade -----
  if (v.has_retake === true) {
    if (zhIds.length > 0) {
      retakes.push({ id: "potzh", label: L.retake, targets: zhIds, pick: "choose", mode: "replace" });
      flag(b, "potzh", "potzhCheck");
    } else {
      flag(b, "potzh", "potzhNoZh");
    }
  }
  if (v.has_offered_exam_grade === true) {
    flag(b, "megajanlott", "offeredGrade");
  }

  // ----- grade -----
  const inSemesterGates = [...zhGates, ...quickGates, ...theoryGates, ...assignGates];
  const hasExam = types === "exam_only" || types === "practice_and_exam";
  if (hasExam) components.push({ id: "vizsga", label: L.exam, kind: "exam", scale: { kind: "grade" } });

  if (!examOnly) {
    if (types === "unclear") flag(b, "grade", "gradeTypesUnclear");
    let grade: string | null = null;
    let label = "";
    if (calc === "raw_points_to_bands") {
      if (gradeZh) b.errors.push(E.gradeZhNotPoints);
      if (terms.length === 0 && b.errors.length === 0) b.errors.push(E.noScoredComponent);
      grade = pointBands(b, v, terms, derived, tables, t);
      label = L.pathPoints;
    } else if (calc === "component_grades_to_points") {
      const gradeZhIds = gradeZh ? zhIds : [];
      if (gradeZhIds.length === 0 && !theoryGrade) {
        b.errors.push(E.noGradedComponent);
      } else {
        // A zh grade often counts more ("dupla pontszámmal"): the weight that makes the stated
        // total come out, when there is a whole one, else 1.
        const others = terms.reduce((s, t) => s + t.max, 0) + (theoryGrade ? 5 : 0);
        const stated = asNumber(v.final_total_max);
        const zhMax = gradeZhIds.length * 5;
        let weight = 1;
        if (stated && !stated.percent && zhMax > 0) {
          const w = (stated.value - others) / zhMax;
          if (Number.isInteger(w) && w >= 1 && w <= 5) weight = w;
        }
        const gradeTerms = [
          ...gradeZhIds.map((id) => ({ expr: weight === 1 ? id : `${weight} * ${id}`, max: 5 * weight })),
          ...(theoryGrade ? [{ expr: "elmelet", max: 5 }] : []),
        ];
        const all = [...gradeTerms, ...terms];
        const sum = all.reduce((s, t) => s + t.max, 0);
        if (weight > 1) flag(b, "grade", "zhWeight", weight, fmt(sum));
        else if (stated && !stated.percent && stated.value !== sum)
          flag(b, "grade", "totalMismatch", fmt(sum), fmt(stated.value));
        else flag(b, "grade", "gradesSingleWeight");
        grade = pointBands(b, v, all, derived, tables, t);
        label = L.pathGradesAsPoints;
      }
    } else if (calc === "average_of_grades") {
      if (!gradeZh || zhIds.length === 0) b.errors.push(E.averageNeedsGrades);
      else {
        derived.push({ id: "atlag", label: L.average, expr: zhIds.length === 1 ? zhIds[0] : `(${zhIds.join(" + ")}) / ${zhIds.length}` });
        grade = "floor(atlag + 0.5)";
        label = L.pathAverage;
        flag(b, "atlag", "averageEqual");
      }
    } else {
      b.errors.push(E.cannotWriteGrade);
    }
    outcomes.push({
      id: "gyak",
      label: L.practiceGrade,
      kind: "gyakorlat",
      select: "first",
      ...(inSemesterGates.length > 0 && { gates: inSemesterGates }),
      paths: [{ id: "alap", label: label || L.pathBase, grade: grade ?? "1" }],
    });
    if (types === "practice_and_exam") {
      outcomes.push({
        id: "vizs",
        label: L.examGrade,
        kind: "vizsga",
        select: "first",
        gates: [{ id: "gyakjegy", label: L.practiceAtLeast2, test: "grade(gyak) >= 2", onFail: "none" }],
        paths: [{ id: "alap", label: L.exam, grade: "vizsga" }],
      });
    }
  } else {
    outcomes.push({
      id: "vizs",
      label: L.examGrade,
      kind: "vizsga",
      select: "first",
      ...(inSemesterGates.length > 0 && { gates: inSemesterGates }),
      paths: [{ id: "alap", label: L.exam, grade: "vizsga" }],
    });
    const limitsRead = GRADE_LIMIT_FIELDS.some((f) => asNumber(v[f]) !== null);
    if (limitsRead) flag(b, "grade", "limitsNotBound");
  }
  flag(b, "survey", "surveyAuto");

  if (b.errors.length > 0) return { rules: null, errors: b.errors };
  if (components.length === 0) return { rules: null, errors: [E.noComponents] };

  const checked = validateRules({ schemaVersion: 1, components, retakes, derived, tables, outcomes, flags: b.flags }, locale);
  if (!checked.ok) return { rules: null, errors: checked.errors.map((e) => getMessages(locale).rules.extract.invalidRule(e)) };
  const semantic = semanticErrors(checked.rules, new Date(), undefined, undefined, locale);
  if (semantic.length > 0) return { rules: null, errors: semantic };
  return { rules: checked.rules, errors: [] };
}

