// The requirement libraries' user-facing text in English (the Hungarian output is covered by the
// existing rules tests, which call everything without a locale).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFormula, describeFormula } from "@/lib/rules/expr";
import { validateRules } from "@/lib/rules/validate";
import { describeRules, tableTitle } from "@/lib/rules/describe";
import { evaluate } from "@/lib/rules/engine";
import { courseStanding } from "@/lib/rules/standing";
import { solveFor } from "@/lib/rules/solve";
import { instanceLabel, shortDayLabel, type Instance } from "@/lib/rules/instances";
import { flagText } from "@/lib/rules/flags";
import { catchUpNotification } from "@/lib/notifications";
import { extractRules } from "@/lib/rules/extract";
import {
  FIELD_IDS,
  consistency,
  emptySurvey,
  fieldMeta,
  readSurvey,
  sections,
  surveyRules,
  type SurveyValues,
} from "@/lib/rules/extract/survey";
import { RULE_TEMPLATES } from "@/lib/rules/fixtures";
import { resultId, type RequirementResult, type SubjectRules } from "@/lib/rules/types";
import { NOW } from "./rulesHelpers";

const rules: SubjectRules = {
  schemaVersion: 1,
  components: [
    { id: "jelen", label: "Attendance", kind: "attendance", limit: { maxAbsences: 3, countExcused: true, onExceed: "none" } },
    { id: "zh", label: "Test", kind: "exam", scale: { kind: "points", max: 100, passAt: 40 } },
  ],
  retakes: [],
  derived: [],
  tables: [{ id: "jegy", rows: [{ min: 0, value: 1 }, { min: 50, value: 2 }, { min: 60, value: 3 }, { min: 75, value: 4 }, { min: 90, value: 5 }] }],
  outcomes: [{ id: "gyak", label: "Practice grade", kind: "gyakorlat", select: "first", paths: [{ id: "alap", label: "Base", grade: "table(jegy, zh)" }] }],
  flags: [],
};
const absent = (i: number): RequirementResult => ({
  id: resultId("c", "jelen", `n:${i}`),
  courseId: "c",
  componentId: "jelen",
  instanceKey: `n:${i}`,
  state: "recorded",
  value: { kind: "attendance", status: "unexcused" },
});

test("formula errors and renderings follow the language", () => {
  const hu = parseFormula("zh1 +");
  const en = parseFormula("zh1 +", "en");
  assert.ok(!hu.ok && !en.ok);
  assert.equal(!hu.ok && hu.error.message, "Váratlan vége a képletnek: szám, azonosító vagy „(” várható");
  assert.equal(!en.ok && en.error.message, "Unexpected end of the formula: expected a number, an identifier or “(”");
  assert.equal(describeFormula("floor((zh1+zh2)/20)", { zh1: "Test 1", zh2: "Test 2" }, "en"), "(Test 1 + Test 2) / 20, rounded down");
  assert.equal(describeFormula("floor((zh1+zh2)/20)", { zh1: "ZH1", zh2: "ZH2" }), "(ZH1 + ZH2) / 20, lefelé kerekítve");
  assert.equal(describeFormula("count(failed, zh1) == 0 && 2.5 > x", {}, "en"), "number of failed (zh1) = 0 and 2.5 > x");
});

test("validation errors and warnings are reported in the language asked for", () => {
  const bad = { ...rules, components: [{ id: "Zh", label: "", kind: "exam", scale: { kind: "points", max: 10 } }] };
  const hu = validateRules(bad);
  const en = validateRules(bad, "en");
  assert.ok(!hu.ok && !en.ok);
  assert.ok(!hu.ok && hu.errors.some((e) => e.includes("az azonosító kisbetűvel kezdődik")));
  assert.ok(!en.ok && en.errors.includes("components[0].id: the id starts with a lowercase letter and may only contain a–z, 0–9 and _ (at most 40 characters)"));
  assert.ok(!en.ok && en.errors.includes("components[0].label: expected non-empty text"));
  const refs = validateRules({ ...rules, derived: [{ id: "x", label: "X", expr: "nope + 1" }] }, "en");
  assert.ok(!refs.ok && refs.errors.includes("derived[0] = derived.x.expr: Unknown identifier: “nope” (character 1)".replace("derived[0] = ", "")));
});

test("the rules summary, the standing and the solver speak English", () => {
  const sections = describeRules(rules, "en");
  assert.deepEqual(sections[0].lines, [
    "Attendance: at most 3 absences (excused ones count too), beyond that no grade",
    "Test: 100 points, passed with at least 40",
  ]);
  assert.equal(sections[1].title, "Calculation");
  assert.equal(sections[1].lines[0], "Grade table: ≥ 0: 1, ≥ 50: 2, ≥ 60: 3, ≥ 75: 4, ≥ 90: 5");
  assert.equal(tableTitle(rules, "jegy", "en"), "Grade table");
  assert.equal(describeRules(rules)[1].lines[0].startsWith("Jegytáblázat: "), true);

  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(courseStanding(rules, [absent(1), absent(2)], now, "en")!.risk, "1 more absence allowed");
  assert.equal(courseStanding(rules, [absent(1), absent(2), absent(3)], now, "en")!.risk, "No more absences allowed");
  assert.equal(courseStanding(rules, [1, 2, 3, 4].map(absent), now, "en")!.risk, "You are over the absence limit");
  const attendanceGate = evaluate(rules, [absent(1)], now, "en").outcomes[0].gates[0].label;
  assert.equal(attendanceGate, "Attendance: at most 3 absences");
  assert.equal(evaluate(rules, [absent(1)], now).outcomes[0].gates[0].label, "Attendance: legfeljebb 3 hiányzás");

  const q = { outcomeId: "gyak", goal: 5, target: "zh", others: "worst" as const };
  assert.equal(solveFor(rules, [], now, { ...q, outcomeId: "nope" }, "en").reason, "Unknown grade.");
  const over = solveFor(rules, [1, 2, 3, 4].map(absent), now, q, "en");
  assert.equal(over.status, "unreachable");
  assert.match(over.reason!, /^Condition that cannot be met: Attendance: at most 3 absences\.$/);
});

test("engine warnings are translated, and the locale does not change the numbers", () => {
  const stray: RequirementResult = { id: "x", courseId: "c", componentId: "ghost", instanceKey: "n:1", state: "pending", label: "Ghost" };
  assert.deepEqual(evaluate(rules, [stray], NOW, "en").warnings, ["Result of an unknown component: “Ghost” (ghost, n:1)"]);
  assert.deepEqual(evaluate(rules, [stray], NOW).warnings, ["Ismeretlen összetevő eredménye: „Ghost” (ghost, n:1)"]);
  const t = RULE_TEMPLATES[0].rules;
  assert.deepEqual(
    evaluate(t, [], NOW, "en").outcomes.map((o) => [o.outcomeId, o.best, o.worst]),
    evaluate(t, [], NOW).outcomes.map((o) => [o.outcomeId, o.best, o.worst])
  );
});

test("instance labels, the day label and the catch-up notification", () => {
  const at = new Date("2026-10-01T14:00:00Z"); // Thursday 16:00 Budapest
  assert.equal(shortDayLabel(at), "okt. 1. (Cs)");
  assert.equal(shortDayLabel(at, "en"), "Oct 1 (Thu)");
  const session = { start: at.toISOString() } as never;
  const instance: Instance = { key: "s:1", at: at.toISOString(), session, week: 4, tracked: true, pinned: false };
  assert.equal(instanceLabel(instance), "okt. 1. (Cs) 16:00 · 4. hét");
  assert.equal(instanceLabel(instance, "en"), "Oct 1 (Thu) 16:00 · Week 4");
  assert.equal(instanceLabel({ key: "n:3", tracked: false, pinned: false }, "en"), "#3");
  assert.equal(instanceLabel({ key: "n:3", tracked: false, pinned: false }), "3.");

  const end = "2026-10-06T08:00:00Z";
  const linked = [{ instance: { session: {}, tracked: true, end } }] as never;
  const pending = [{ session: {}, end }] as never;
  const now = new Date("2026-10-06T08:35:00Z");
  const en = catchUpNotification(linked, pending, new Set(), now, "en")!;
  assert.deepEqual([en.title, en.body], ["What happened in your class?", "One of today’s classes is waiting for data."]);
  assert.equal(catchUpNotification(linked, pending, new Set(), now)!.title, "Mi történt az óráidon?");
});

const SIMPLE: SurveyValues = {
  ...(Object.fromEntries(FIELD_IDS.map((id) => [id, null])) as SurveyValues),
  grade_types: "practice_grade_only",
  attendance_mandatory: false,
  has_quick_tests: false,
  has_assignment: false,
  has_theory_test_in_semester: false,
  has_retake: false,
  has_offered_exam_grade: false,
  zh_scoring: "points",
  grade_calculation: "raw_points_to_bands",
  zh_count: 2,
  zh_max_points: { value: 50, percent: false },
  grade2_min_points: { value: 20, percent: false },
  grade3_min_points: { value: 40, percent: false },
  grade4_min_points: { value: 60, percent: false },
  grade5_min_points: { value: 80, percent: false },
};

test("survey: errors and labels in English, flags as codes shown in either language", () => {
  assert.deepEqual(surveyRules({ ...SIMPLE, zh_count: null }, "en").errors, ["Enter how many midterms are written."]);
  assert.deepEqual(surveyRules({ ...SIMPLE, zh_count: null }).errors, ["Add meg, hány zárthelyit írnak."]);

  const withFlags: SurveyValues = { ...SIMPLE, attendance_mandatory: true, max_absences: { value: 3, percent: false }, has_quick_tests: true, quick_test_total_max: { value: 20, percent: false } };
  const en = surveyRules(withFlags, "en");
  const hu = surveyRules(withFlags);
  assert.deepEqual(en.errors, []);
  assert.deepEqual(en.rules!.components.map((c) => c.label), ["Attendance", "Midterm 1", "Midterm 2", "Quick tests"]);
  assert.deepEqual(hu.rules!.components.map((c) => c.label), ["Jelenlét", "1. zh", "2. zh", "Röpzh-k"]);
  assert.equal(en.rules!.outcomes[0].label, "Practice grade");

  // The stored message is always the Hungarian text; the code renders in the reader's language.
  const flag = en.rules!.flags.find((f) => f.code === "quickCountUnknown")!;
  assert.equal(flag.message, "A röpzh-k számát nem találtuk; 1 alkalomnak vettük, a teljes pontszámmal.");
  assert.equal(flagText(flag, "en"), "We did not find the number of quick tests; we took it as 1 occasion with the full points.");
  assert.equal(flagText(flag, "hu"), flag.message);
  assert.deepEqual(en.rules!.flags.map((f) => f.message), hu.rules!.flags.map((f) => f.message), "the stored rules do not depend on the language");
  assert.equal(flagText({ message: "Régi, kód nélküli", resolved: false } as never, "en"), "Régi, kód nélküli");

  // A flag with arguments survives validation and rendering.
  const mix = surveyRules({ ...SIMPLE, has_quick_tests: true, quick_test_total_max: { value: 25, percent: false }, quick_test_count: 10 }, "en");
  const divisible = mix.rules!.flags.find((f) => f.code === "quickNotDivisible")!;
  assert.deepEqual(divisible.args, [25, 10, 2.5]);
  assert.equal(flagText(divisible, "en"), "The quick tests’ points do not divide evenly (25 / 10); we took 2.5 points per occasion.");
  assert.equal(flagText(divisible), "A röpzh-k pontszáma nem osztható egyenlően (25 / 10); alkalmanként 2,5 pontot vettünk.");
});

test("survey: reasons, field labels and sections follow the language", () => {
  assert.equal(emptySurvey("en").fields.zh_count.reasons[0], "Fill this in.");
  assert.equal(emptySurvey().fields.zh_count.reasons[0], "Töltsd ki.");
  assert.equal(fieldMeta("en").zh_scoring.label, "How are the midterms scored?");
  assert.deepEqual(fieldMeta("en").zh_scoring.options!.map((o) => o.label).slice(0, 2), ["With points (or percent)", "With a grade (1–5)"]);
  assert.equal(fieldMeta().zh_scoring.label, "Hogyan értékelik a zárthelyiket?");
  assert.equal(sections("en")[2].title, "Midterms");
  const reasons = consistency({ ...SIMPLE, grade2_min_points: { value: 50, percent: false }, grade3_min_points: { value: 40, percent: false } }, "en");
  assert.ok(reasons.some(([, r]) => r === "The grade limits must rise strictly with the grades (2 < 3 < 4 < 5)."));
  const depends = readSurvey({ has_quick_tests: { type: "noul", noul: 0.5 }, quick_test_count: { type: "choice", choice: "n4", confidence: 0.99, probabilities: {} } }, [], "en");
  assert.ok(depends.fields.quick_test_count.reasons.includes("Depends on whether there are quick tests or quizzes."));
});

test("the pattern parser's questions, errors and flags follow the language", () => {
  const dotnet = readFileSync("fixtures/kovetelmeny/dotnet/source.txt", "utf8");
  const hu = extractRules(dotnet);
  const en = extractRules(dotnet, {}, new Date(), "en");
  const q = en.questions.find((x) => x.id === "onfail:zhk")!;
  assert.match(q.prompt, /^If “.+” is not met, what follows\?$/);
  assert.deepEqual(q.options.map((o) => o.label), ["Fail (1)", "No grade (barred, signature refused)"]);
  assert.deepEqual(q.options.map((o) => o.criterion), hu.questions.find((x) => x.id === "onfail:zhk")!.options.map((o) => o.criterion), "Jev's prompts stay English");
  assert.equal(extractRules("Kedves Hallgatók! A jövő heti óra elmarad. Üdvözlettel: az oktató", {}, new Date(), "en").errors[0], "We did not recognise any requirements in the text. Are you sure you pasted the course requirements?");
  assert.equal(extractRules("Kedves Hallgatók! A jövő heti óra elmarad. Üdvözlettel: az oktató").errors[0].startsWith("A szövegből nem ismertünk fel"), true);
});
