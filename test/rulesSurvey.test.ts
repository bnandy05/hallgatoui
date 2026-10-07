import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHOICE_REVIEW_BELOW,
  FIELD_IDS,
  FIELD_META,
  GATES,
  MAX_CANDIDATES,
  NOUL_REVIEW_BAND,
  SURVEY_MAX_DOC_CHARS,
  SURVEY_MODEL,
  buildSurveyRequest,
  emptySurvey,
  expectedValues,
  numberCandidates,
  readSurvey,
  scoreSurvey,
  surveyRules,
  surveyValues,
  CANNOT_WRITE_GRADE,
  type Candidate,
  type Expected,
  type FieldId,
  type SurveyValues,
} from "@/lib/rules/extract/survey";
import { evaluate } from "@/lib/rules/engine";
import { pts, seriesPts, NOW } from "./rulesHelpers";

const source = (name: string) => readFileSync(`fixtures/kovetelmeny/${name}/source.txt`, "utf8");
const expected = (name: string) => JSON.parse(readFileSync(`fixtures/kovetelmeny/${name}/survey.json`, "utf8")) as Expected;
const texts = (text: string) => numberCandidates(text).map((c) => c.text);

// ----- candidates -----

test("a range is offered whole and as its two ends, a percent sign belonging to both", () => {
  const c = numberCandidates("A jegy 50–60% között jeles, 12-16 pont közepes.");
  assert.deepEqual(c.map((x) => x.text), ["50–60%", "50%", "60%", "12–16", "12", "16"]);
  assert.deepEqual([c[0].value, c[0].upper, c[0].percent], [50, 60, true]);
  assert.deepEqual([c[1].value, c[1].upper, c[1].percent], [50, undefined, true]);
  assert.deepEqual([c[3].value, c[3].upper, c[3].percent], [12, 16, false]);
  assert.deepEqual(c.map((x) => x.id), ["c0", "c1", "c2", "c3", "c4", "c5"]);
});

test("percents, decimals and 'százalék' are read", () => {
  const c = numberCandidates("Legalább 50% kell, 2,5 pont jár, 70 százalék felett jeles, 3.5 kredit.");
  assert.deepEqual(c.map((x) => [x.text, x.value, x.percent]), [
    ["50%", 50, true],
    ["2,5", 2.5, false],
    ["70%", 70, true],
    ["3.5", 3.5, false],
  ]);
});

test("years, dates, longer digit runs and codes are not numbers", () => {
  assert.deepEqual(texts("2026 tavasz, 2026. 10. 07. és 2026.10.07, 2026-10-07, 1999, 12345, zh1, Z2, ABC123, 5 pont"), ["5"]);
  assert.deepEqual(texts("A 2-es jegy"), ["2"]);
  assert.deepEqual(texts("a 202 a 2026-ból nem jön ki"), ["202"]);
});

test("duplicates keep the first occurrence and its context; document order", () => {
  const c = numberCandidates("Az első zh 40 pontos.\n\nA második zh is   40 pontos, és 10 röpzh.");
  assert.deepEqual(c.map((x) => x.text), ["40", "10"]);
  assert.match(c[0].context, /^Az első zh 40 pontos\./);
  assert.ok(!c[0].context.includes("\n"));
  assert.ok(c[0].context.length <= 75);
  assert.equal(numberCandidates("12,5 és 12.5").length, 1);
});

test("at most MAX_CANDIDATES are offered", () => {
  const text = Array.from({ length: 300 }, (_, i) => String(i + 1)).join(" pont ");
  assert.equal(numberCandidates(text).length, MAX_CANDIDATES);
});

// ----- the request -----

const course = { name: "Analízis I.", code: "IP-18aAN1G" };

test("the request has 24 questions, one per field, with the right shapes", () => {
  const text = source("matek");
  const { body, candidates, truncated } = buildSurveyRequest(text, course);
  assert.equal(truncated, false);
  assert.equal(body.model, SURVEY_MODEL);
  assert.equal(SURVEY_MODEL, "jev-latest");
  assert.deepEqual(body.state, { course: "Analízis I. (IP-18aAN1G)", document: text });
  assert.deepEqual(Object.keys(body.questions).sort(), [...FIELD_IDS].sort());
  assert.equal(Object.keys(body.questions).length, 24);
  for (const id of FIELD_IDS) {
    const q = body.questions[id];
    assert.match(q.instructions, /`course`/, id);
    const kind = FIELD_META[id].kind;
    assert.equal(q.type, kind === "yesno" ? "noul" : "choice", id);
    if (kind === "point") {
      assert.deepEqual(Object.keys(q.criteria!), ["none", ...candidates.map((c) => c.id)], id);
      assert.equal(q.criteria!.none, "The document states no such number.");
      for (const c of candidates) assert.equal(q.criteria![c.id], c.text);
    }
    if (kind === "count") {
      assert.deepEqual(Object.keys(q.criteria!), ["none", ...Array.from({ length: 15 }, (_, i) => `n${i + 1}`)]);
      assert.equal(q.criteria!.n2, "2 (két, kettő)");
      assert.equal(q.criteria!.n12, "12 (tizenkettő)");
    }
  }
  assert.deepEqual(Object.keys(body.questions.attendance_mandatory.criteria!), ["true", "false"]);
  assert.deepEqual(Object.keys(body.questions.grade_types.criteria!), ["practice_grade_only", "exam_only", "practice_and_exam", "unclear"]);
  assert.ok(candidates.length > 5);
});

test("the course name stands alone without a code, and a long document is cut", () => {
  const text = "x ".repeat(SURVEY_MAX_DOC_CHARS);
  const { body, truncated } = buildSurveyRequest(text, { name: "Programozás" });
  assert.equal(body.state.course, "Programozás");
  assert.equal(body.state.document.length, SURVEY_MAX_DOC_CHARS);
  assert.equal(truncated, true);
  assert.equal(buildSurveyRequest("x".repeat(SURVEY_MAX_DOC_CHARS), { name: "A" }).truncated, false);
});

test("a number beyond the cut is not a candidate", () => {
  const text = `${"a ".repeat(SURVEY_MAX_DOC_CHARS / 2)} 77 pont`;
  assert.deepEqual(buildSurveyRequest(text, { name: "A" }).candidates, []);
});

// ----- reading -----

type Raw = Record<string, unknown>;
const noul = (p: number) => ({ type: "noul", noul: p });
const choice = (label: string, confidence = 0.95) => ({ type: "choice", choice: label, confidence, probabilities: { [label]: confidence } });

/** Confident answers that say what `exp` says, for the candidates of `cands`. */
function answersFor(exp: Expected, cands: Candidate[], confidence = 0.97): Raw {
  const out: Raw = {};
  for (const id of FIELD_IDS) {
    const e = exp[id];
    if (e === undefined) continue;
    const kind = FIELD_META[id].kind;
    if (kind === "yesno") out[id] = noul(e ? 0.98 : 0.02);
    else if (kind === "enum") out[id] = choice(e as string, confidence);
    else if (kind === "count") out[id] = choice(e === "none" ? "none" : `n${e}`, confidence);
    else {
      const c = typeof e === "number" ? cands.find((x) => x.value === e && x.upper === undefined) : undefined;
      assert.ok(e === "none" || c, `${id}: no candidate for ${e}`);
      out[id] = choice(e === "none" ? "none" : c!.id, confidence);
    }
  }
  return out;
}

/** A document with plenty of numbers and answers that are all confident and consistent. */
const NUMBERS = "5 10 20 30 40 45 50 55 60 65 75 85 90 100 120 150 200 25%";
const cands = numberCandidates(NUMBERS);
const cid = (n: string) => cands.find((c) => c.text === n)!.id;

const calm: Expected = {
  grade_types: "practice_grade_only",
  attendance_mandatory: true,
  has_quick_tests: true,
  has_assignment: true,
  has_theory_test_in_semester: true,
  has_retake: false,
  has_offered_exam_grade: false,
  zh_scoring: "points",
  grade_calculation: "raw_points_to_bands",
  max_absences: 5,
  zh_count: 2,
  quick_test_count: 5,
  assignment_count: 2,
  zh_max_points: 40,
  zh_min_points: 10,
  quick_test_total_max: 20,
  quick_test_min_points: 5,
  assignment_points_on_time: 10,
  theory_test_pass_threshold: 60,
  final_total_max: 120,
  grade2_min_points: 45,
  grade3_min_points: 65,
  grade4_min_points: 85,
  grade5_min_points: 100,
};
const calmAnswers = (): Raw => answersFor(calm, cands);
const read = (a: Raw) => readSurvey(a, cands);

test("a calm, consistent document gives no flag at all", () => {
  const d = read(calmAnswers());
  for (const id of FIELD_IDS) assert.deepEqual([id, d.fields[id].flagged, d.fields[id].reasons], [id, false, []]);
  assert.equal(d.fields.max_absences.quote, cands.find((c) => c.text === "5")!.context);
  assert.deepEqual(d.fields.zh_max_points.value, { value: 40, percent: false });
  assert.equal(d.fields.zh_count.value, 2);
  assert.equal(d.fields.attendance_mandatory.value, true);
});

test("a Noul answer is flagged inside the open band, strictly", () => {
  const [lo, hi] = NOUL_REVIEW_BAND;
  const at = (p: number) => read({ ...calmAnswers(), has_retake: noul(p) }).fields.has_retake;
  assert.deepEqual([at(0.5).flagged, at(0.5).value], [true, true]);
  assert.deepEqual([at(0.4).flagged, at(0.4).value], [true, false]);
  assert.equal(at(lo).flagged, false);
  assert.equal(at(hi).flagged, false);
  assert.equal(at(lo + 0.01).flagged, true);
  assert.equal(at(hi - 0.01).flagged, true);
  assert.deepEqual([at(0.1).flagged, at(0.1).value], [false, false]);
  assert.deepEqual([at(0.9).flagged, at(0.9).value], [false, true]);
  assert.match(at(0.5).reasons[0], /Bizonytalan/);
});

test("a Choice answer is flagged below the confidence threshold", () => {
  const at = (c: number) => read({ ...calmAnswers(), zh_count: choice("n2", c) }).fields.zh_count;
  assert.equal(at(CHOICE_REVIEW_BELOW).flagged, false);
  assert.equal(at(CHOICE_REVIEW_BELOW - 0.01).flagged, true);
  assert.match(at(0.5).reasons[0], /50%/);
  assert.equal(at(0.5).value, 2, "the answer is kept, only flagged");
  const num = read({ ...calmAnswers(), zh_max_points: choice(cid("40"), 0.4) }).fields.zh_max_points;
  assert.equal(num.flagged, true);
  assert.ok(num.quote);
});

test("unclear, not_described and other are always flagged", () => {
  const f = (id: string, label: string) => read({ ...calmAnswers(), [id]: choice(label, 0.99) }).fields[id as FieldId];
  for (const [id, label] of [
    ["grade_types", "unclear"],
    ["zh_scoring", "not_described"],
    ["grade_calculation", "not_described"],
    ["grade_calculation", "other"],
  ] as const) {
    const x = f(id, label);
    assert.equal(x.flagged, true, `${id}=${label}`);
    assert.equal(x.value, label);
    assert.ok(x.reasons.length > 0);
  }
});

test("'none' answers give null values", () => {
  const d = read({ ...calmAnswers(), zh_min_points: choice("none"), zh_count: choice("none"), max_absences: choice("none") });
  assert.equal(d.fields.zh_min_points.value, null);
  assert.equal(d.fields.zh_count.value, null);
  assert.equal(d.fields.max_absences.value, null);
  assert.equal(d.fields.zh_min_points.flagged, false, "no per-test minimum is a normal answer");
});

// A gate: the structure answer that closes it, and the details it governs.
const GATE_CASES: { gate: FieldId; closed: unknown; open: unknown; dependents: FieldId[] }[] = [
  { gate: "has_quick_tests", closed: noul(0.02), open: noul(0.98), dependents: ["quick_test_count", "quick_test_total_max", "quick_test_min_points"] },
  { gate: "has_assignment", closed: noul(0.02), open: noul(0.98), dependents: ["assignment_count", "assignment_points_on_time"] },
  { gate: "has_theory_test_in_semester", closed: noul(0.02), open: noul(0.98), dependents: ["theory_test_pass_threshold"] },
  { gate: "attendance_mandatory", closed: noul(0.02), open: noul(0.98), dependents: ["max_absences"] },
  { gate: "zh_scoring", closed: choice("no_zh"), open: choice("points"), dependents: ["zh_count", "zh_max_points", "zh_min_points"] },
  { gate: "zh_scoring", closed: choice("grade_1_5"), open: choice("points"), dependents: ["zh_max_points", "zh_min_points"] },
  {
    gate: "grade_calculation",
    closed: choice("average_of_grades"),
    open: choice("raw_points_to_bands"),
    dependents: ["final_total_max", "grade2_min_points", "grade3_min_points", "grade4_min_points", "grade5_min_points"],
  },
];

test("a confident closed gate hides its details and drops their answers", () => {
  for (const c of GATE_CASES) {
    const d = read({ ...calmAnswers(), [c.gate]: c.closed });
    for (const dep of c.dependents) {
      const f = d.fields[dep];
      assert.deepEqual([dep, f.hidden, f.value, f.flagged, f.reasons], [dep, true, null, false, []], `${c.gate} closes ${dep}`);
    }
    assert.equal(surveyValues(d)[c.dependents[0]], null);
  }
});

test("an open gate leaves its details alone", () => {
  for (const c of GATE_CASES) {
    const d = read({ ...calmAnswers(), [c.gate]: c.open });
    for (const dep of c.dependents) assert.equal(d.fields[dep].hidden, false, dep);
  }
});

test("a closed gate in doubt keeps the answer and flags the detail", () => {
  const doubtful = (c: (typeof GATE_CASES)[number]) =>
    (c.closed as { type: string }).type === "noul" ? noul(0.4) : choice((c.closed as { choice: string }).choice, 0.5);
  for (const c of GATE_CASES) {
    const d = read({ ...calmAnswers(), [c.gate]: doubtful(c) });
    assert.equal(d.fields[c.gate].flagged, true);
    for (const dep of c.dependents) {
      const f = d.fields[dep];
      assert.equal(f.hidden, false, dep);
      assert.equal(f.flagged, true, dep);
      assert.ok(f.reasons.some((r) => /^Attól függ, hogy /.test(r)), `${dep}: ${f.reasons.join("|")}`);
      assert.notEqual(f.value, null, `${dep} keeps its answer`);
    }
  }
});

test("every gated field is covered by a gate case", () => {
  const covered = new Set(GATE_CASES.flatMap((c) => c.dependents));
  for (const id of Object.keys(GATES)) assert.ok(covered.has(id as FieldId), id);
});

test("consistency: a required value under an open gate is none", () => {
  const d = read({ ...calmAnswers(), zh_max_points: choice("none"), quick_test_total_max: choice("none"), grade3_min_points: choice("none") });
  for (const id of ["zh_max_points", "quick_test_total_max", "grade3_min_points"] as const) {
    assert.equal(d.fields[id].flagged, true, id);
    assert.match(d.fields[id].reasons.at(-1)!, /nem találtuk/);
  }
  // …but not when the gate is closed
  const closed = read({ ...calmAnswers(), has_quick_tests: noul(0.01), quick_test_total_max: choice("none") });
  assert.equal(closed.fields.quick_test_total_max.flagged, false);
});

test("consistency: minimums above maximums", () => {
  const d = read({ ...calmAnswers(), zh_min_points: choice(cid("45")), quick_test_min_points: choice(cid("30")) });
  assert.match(d.fields.zh_min_points.reasons.join(), /nagyobb a maximumnál/);
  assert.match(d.fields.quick_test_min_points.reasons.join(), /nagyobb az összpontszámnál/);
});

test("consistency: grade limits must rise strictly, in one unit, within the total", () => {
  const flat = read({ ...calmAnswers(), grade4_min_points: choice(cid("65")) });
  assert.match(flat.fields.grade4_min_points.reasons.join(), /szigorúan/);
  assert.equal(flat.fields.grade3_min_points.flagged, false);

  const mixed = read({ ...calmAnswers(), grade3_min_points: choice(cid("25%")) });
  for (const id of ["grade2_min_points", "grade3_min_points", "grade4_min_points", "grade5_min_points"] as const) {
    assert.match(mixed.fields[id].reasons.join(), /százalék, másik része pont/, id);
  }

  const big = read({ ...calmAnswers(), grade5_min_points: choice(cid("150")) });
  assert.match(big.fields.grade5_min_points.reasons.join(), /nagyobb a legnagyobb összpontszámnál/);

  const over = numberCandidates("100 120 150%");
  const pct = readSurvey({ grade2_min_points: choice(over.find((c) => c.text === "150%")!.id) }, over);
  assert.match(pct.fields.grade2_min_points.reasons.join(), /100% fölött/);
});

test("consistency: the components' points add up to the stated maximum", () => {
  assert.equal(read(calmAnswers()).fields.final_total_max.flagged, false, "2×40 + 20 + 2×10 = 120");
  const d = read({ ...calmAnswers(), final_total_max: choice(cid("100")) });
  assert.match(d.fields.final_total_max.reasons.join(), /120.*100/);
});

test("malformed, missing and invented answers become missing answers", () => {
  const bad: Raw = {
    ...calmAnswers(),
    has_retake: { type: "choice", choice: "true", confidence: 0.9 }, // wrong type for a Noul
    zh_scoring: choice("sometimes"), // a label that is not in the criteria
    zh_count: { type: "choice", choice: "n2" }, // no confidence
    max_absences: choice("c9999"), // not a candidate
    grade_types: "practice_grade_only",
    has_quick_tests: { type: "noul", noul: 3 },
    has_assignment: null,
  };
  delete bad.has_offered_exam_grade;
  const d = read(bad);
  for (const id of ["has_retake", "zh_scoring", "zh_count", "max_absences", "grade_types", "has_quick_tests", "has_assignment", "has_offered_exam_grade"] as const) {
    assert.deepEqual([id, d.fields[id].value, d.fields[id].flagged], [id, null, true]);
    assert.ok(d.fields[id].reasons.includes("Nem kaptunk választ, add meg te."), id);
    assert.equal(d.raw[id], undefined, id);
  }
  for (const garbage of [null, undefined, "x", 3, [], { answers: 1 }]) {
    const e = readSurvey(garbage, cands);
    assert.ok(FIELD_IDS.every((id) => e.fields[id].flagged && e.fields[id].value === null));
  }
});

test("the raw answers are kept and re-read to the same draft", () => {
  const d = read({ ...calmAnswers(), zh_count: choice("n2", 0.5), extra: 1 });
  assert.deepEqual(d.raw.zh_count, { type: "choice", choice: "n2", confidence: 0.5, probabilities: { n2: 0.5 } });
  assert.equal("extra" in d.raw, false);
  assert.deepEqual(readSurvey(d.raw, cands), d);
});

test("emptySurvey is all flagged and none; surveyValues drops hidden fields", () => {
  const e = emptySurvey();
  assert.ok(FIELD_IDS.every((id) => e.fields[id].flagged && e.fields[id].value === null && !e.fields[id].hidden));
  assert.equal(e.fields.zh_count.reasons[0], "Töltsd ki a dokumentum alapján.");
  const v = surveyValues(read({ ...calmAnswers(), has_assignment: noul(0.01) }));
  assert.equal(v.assignment_count, null);
  assert.equal(v.has_assignment, false);
});

// ----- rules -----

/** What a student types for a figure the document leaves out. */
const student: Record<string, Partial<Record<FieldId, number>>> = {
  matek: { grade2_min_points: 0 },
  analizis: { quick_test_total_max: 40 },
};
function valuesOf(name: string, extra: Partial<SurveyValues> = {}): SurveyValues {
  const v = expectedValues(expected(name));
  for (const [id, n] of Object.entries(student[name] ?? {})) v[id as FieldId] = { value: n, percent: false };
  return { ...v, ...extra };
}

test("every fixture's survey.json answers are valid for the question shapes", () => {
  for (const name of ["dotnet", "progelm", "matek", "analizis"]) {
    const exp = expected(name);
    assert.deepEqual(Object.keys(exp).sort(), [...FIELD_IDS].sort(), name);
    const { candidates } = buildSurveyRequest(source(name), { name });
    // confident answers copied from the document read back to exactly the expected values
    const d = readSurvey(answersFor(exp, candidates), candidates);
    const score = scoreSurvey(d, exp, candidates);
    assert.deepEqual([score.raw, score.after, score.wrongUnflagged], [24, 24, 0], name);
  }
});

test("matek: the survey writes the main numbers", () => {
  const { rules, errors } = surveyRules(valuesOf("matek"));
  assert.deepEqual(errors, []);
  const r = rules!;
  const by = (id: string) => r.components.find((c) => c.id === id)!;
  assert.deepEqual(by("jelen"), { id: "jelen", label: "Jelenlét", kind: "attendance", limit: { maxAbsences: 6, countExcused: true, onExceed: "none" } });
  assert.deepEqual(by("ropzh"), { id: "ropzh", label: "Röpzh-k", kind: "series", item: "ropzh", count: 10, scoring: { kind: "points", max: 4 } });
  for (const i of [1, 2, 3]) {
    assert.deepEqual(by(`zh${i}`), { id: `zh${i}`, label: `${i}. zh`, kind: "exam", scale: { kind: "points", max: 50, passAt: 17 } });
  }
  assert.deepEqual(r.tables, [{ id: "jegy", rows: [{ min: 0, value: 2 }, { min: 75, value: 3 }, { min: 99, value: 4 }, { min: 123, value: 5 }] }]);
  assert.deepEqual(r.derived.map((d) => d.expr), ["zh1 + zh2 + zh3 + ropzh"]);
  assert.equal(r.derived[0].label, "Összpontszám (max 190)");
  assert.deepEqual(r.outcomes.map((o) => o.id), ["gyak"]);
  assert.deepEqual(r.outcomes[0].gates!.map((g) => g.test), ["zh1 >= 17", "zh2 >= 17", "zh3 >= 17", "ropzh >= 20"]);
  assert.deepEqual(r.retakes, [{ id: "potzh", label: "Pótzh", targets: ["zh1", "zh2", "zh3"], pick: "choose", mode: "replace" }]);
  const flags = r.flags.map((f) => f.message);
  assert.ok(flags.includes("Automatikusan olvastuk ki; vesd össze a dokumentummal."));
  assert.ok(flags.includes("Ellenőrizd, melyik zh-t és hogyan váltja ki a pótzh."));
  assert.ok(r.flags.every((f) => !f.resolved));

  // The grades follow the table: 60 + 20 = 80 points is a 3, 150 + 40 a 5.
  const mid = evaluate(r, [pts("zh1", 20), pts("zh2", 20), pts("zh3", 20), ...seriesPts("ropzh", Array(10).fill(2))], NOW);
  assert.equal(mid.outcomes[0].current, 3);
  const top = evaluate(r, [pts("zh1", 50), pts("zh2", 50), pts("zh3", 50), ...seriesPts("ropzh", Array(10).fill(4))], NOW);
  assert.equal(top.outcomes[0].current, 5);
  const failed = evaluate(r, [pts("zh1", 50), pts("zh2", 10), pts("zh3", 50), ...seriesPts("ropzh", Array(10).fill(4))], NOW);
  assert.equal(failed.outcomes[0].current, 1, "a zh under 17 fails the practice grade");
  // Not forced to equal the hand-written matek template: that one adds only the röpzh points above
  // 20 (as a bonus) and takes one point off for a missed röpzh part, which a survey cannot say.
});

test("analizis: the survey writes the main numbers (a weighted formula it cannot express)", () => {
  const x = valuesOf("analizis");
  const { rules, errors } = surveyRules(x);
  assert.deepEqual(errors, []);
  const r = rules!;
  assert.deepEqual(r.tables[0].rows, [{ min: 0, value: 1 }, { min: 30, value: 2 }, { min: 46, value: 3 }, { min: 61, value: 4 }, { min: 81, value: 5 }]);
  assert.deepEqual(r.components.map((c) => c.id), ["zh1", "zh2", "ropzh", "vizsga"]);
  assert.deepEqual(r.outcomes.map((o) => o.id), ["gyak", "vizs"]);
  assert.equal(r.outcomes[1].gates![0].test, "grade(gyak) >= 2");
  assert.ok(r.flags.some((f) => /megajánlott jegy/.test(f.message)));
  // The template's Ö = F/2 + Z1 + Z2 is a weighted sum; the survey adds the röpdolgozat points
  // whole, so the two are not grade-equivalent and the sum (120) differs from the stated 100,
  // which the reader flags instead of fixing.
  const { candidates } = buildSurveyRequest(source("analizis"), { name: "A" });
  const d = readSurvey(answersFor({ ...expected("analizis"), quick_test_total_max: 40 }, candidates), candidates);
  assert.match(d.fields.final_total_max.reasons.join(), /120.*100/);
});

test("dotnet and progelm cannot be written from a survey, and say why", () => {
  // dotnet: every component first gets its own grade, then they are weighted (2*gy1 + …).
  const dotnet = surveyRules(valuesOf("dotnet"));
  assert.equal(dotnet.rules, null);
  assert.ok(dotnet.errors.includes(CANNOT_WRITE_GRADE), dotnet.errors.join("\n"));
  // progelm: +/- röpzh (no point total) and the grade is (zh1 + zh2 + bonus) div 20.
  const progelm = surveyRules(valuesOf("progelm"));
  assert.equal(progelm.rules, null);
  assert.ok(progelm.errors.includes("Add meg a röpzh-k összpontszámát."));
  assert.ok(progelm.errors.includes(CANNOT_WRITE_GRADE));
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
const pt = (value: number, percent = false) => ({ value, percent });

test("percent limits become points of the stated total, or of the components' sum", () => {
  const pct = { grade2_min_points: pt(50, true), grade3_min_points: pt(60, true), grade4_min_points: pt(75, true), grade5_min_points: pt(90, true) };
  const sum = surveyRules({ ...SIMPLE, ...pct });
  assert.deepEqual(sum.errors, []);
  assert.deepEqual(sum.rules!.tables[0].rows, [{ min: 0, value: 1 }, { min: 50, value: 2 }, { min: 60, value: 3 }, { min: 75, value: 4 }, { min: 90, value: 5 }]);
  const stated = surveyRules({ ...SIMPLE, ...pct, final_total_max: pt(120) });
  assert.deepEqual(stated.rules!.tables[0].rows.map((r) => r.min), [0, 60, 72, 90, 108]);
  const odd = surveyRules({ ...SIMPLE, ...pct, final_total_max: pt(33) });
  assert.deepEqual(odd.rules!.tables[0].rows.map((r) => r.min), [0, 16.5, 19.8, 24.75, 29.7]);
  const mixed = surveyRules({ ...SIMPLE, grade3_min_points: pt(60, true) });
  assert.equal(mixed.rules, null);
  assert.match(mixed.errors[0], /százalék, másik része pont/);
});

test("average of grades: grade-scaled zh and the rounded mean", () => {
  const avg = surveyRules({ ...SIMPLE, zh_scoring: "grade_1_5", zh_count: 3, zh_max_points: null, grade_calculation: "average_of_grades", grade2_min_points: null, grade3_min_points: null, grade4_min_points: null, grade5_min_points: null });
  assert.deepEqual(avg.errors, []);
  const r = avg.rules!;
  assert.deepEqual(r.components.map((c) => [c.id, c.label]), [["zh1", "1. zh"], ["zh2", "2. zh"], ["zh3", "3. zh"]]);
  assert.equal(r.outcomes[0].paths[0].grade, "floor(atlag + 0.5)");
  assert.ok(r.flags.some((f) => /egyenlő súllyal/.test(f.message)));
  const grades = (a: 1 | 2 | 3 | 4 | 5, b: 1 | 2 | 3 | 4 | 5, c: 1 | 2 | 3 | 4 | 5) =>
    [a, b, c].map((g, i) => ({ id: `c|zh${i + 1}|n:1`, courseId: "c", componentId: `zh${i + 1}`, instanceKey: "n:1", state: "recorded" as const, value: { kind: "grade" as const, grade: g } }));
  assert.equal(evaluate(r, grades(5, 4, 4), NOW).outcomes[0].current, 4);
  assert.equal(evaluate(r, grades(5, 5, 3), NOW).outcomes[0].current, 4, "4.33 + 0.5 → 4");
  assert.equal(evaluate(r, grades(5, 4, 3), NOW).outcomes[0].current, 4, "4.0 → 4");
  assert.equal(evaluate(r, grades(2, 3, 3), NOW).outcomes[0].current, 3, "2.67 + 0.5 → 3");
  // grades cannot be added as points
  const bad = surveyRules({ ...SIMPLE, zh_scoring: "grade_1_5", zh_max_points: null, quick_test_count: null });
  assert.equal(bad.rules, null);
  const noGrades = surveyRules({ ...SIMPLE, grade_calculation: "average_of_grades" });
  assert.match(noGrades.errors[0], /jeggyel értékelt zárthelyik/);
  for (const calc of ["component_grades_to_points", "other", "not_described"]) {
    assert.deepEqual(surveyRules({ ...SIMPLE, grade_calculation: calc }).errors, [CANNOT_WRITE_GRADE]);
  }
});

test("quick tests, assignments, theory test and attendance without a number", () => {
  const full = surveyRules({
    ...SIMPLE,
    attendance_mandatory: true,
    has_quick_tests: true,
    quick_test_count: 7,
    quick_test_total_max: pt(20),
    quick_test_min_points: pt(50, true),
    has_assignment: true,
    assignment_count: 2,
    assignment_points_on_time: pt(10),
    has_theory_test_in_semester: true,
    theory_test_pass_threshold: pt(50, true),
    has_offered_exam_grade: true,
    grade5_min_points: pt(100),
  });
  assert.deepEqual(full.errors, []);
  const r = full.rules!;
  const by = (id: string) => r.components.find((c) => c.id === id)!;
  assert.deepEqual(by("jelen"), { id: "jelen", label: "Jelenlét", kind: "attendance" });
  assert.deepEqual(by("ropzh"), { id: "ropzh", label: "Röpzh-k", kind: "series", item: "ropzh", count: 7, scoring: { kind: "points", max: 2.86 } });
  assert.deepEqual(by("beadando2"), {
    id: "beadando2",
    label: "2. beadandó",
    kind: "assignment",
    outcomes: [
      { id: "ok", label: "Határidőre beadva", points: 10, accepted: true },
      { id: "nem", label: "Nem fogadták el", points: 0, accepted: false },
    ],
  });
  assert.deepEqual(by("elmelet"), { id: "elmelet", label: "Elméleti teszt", kind: "exam", scale: { kind: "points", max: 100, passAt: 50 } });
  assert.deepEqual(r.outcomes[0].gates!.map((g) => g.test), ["ropzh >= 10", "elmelet >= 50", "count(failed, beadando1, beadando2) == 0"]);
  assert.equal(r.derived[0].expr, "zh1 + zh2 + ropzh + beadando1 + beadando2");
  const flags = r.flags.map((f) => f.message).join("\n");
  assert.match(flags, /A hiányzási határt nem ismerjük/);
  assert.match(flags, /nem osztható egyenlően/);
  assert.match(flags, /minden beadandót el kell fogadni/);
  assert.match(flags, /megajánlott jegy feltételét/);
  // a theory threshold in points: the maximum is unknown
  const pointsT = surveyRules({ ...SIMPLE, has_theory_test_in_semester: true, theory_test_pass_threshold: pt(18) });
  assert.match(pointsT.rules!.flags.map((f) => f.message).join("\n"), /maximumát nem ismerjük/);
  // no count: one item with the whole total
  const noCount = surveyRules({ ...SIMPLE, has_quick_tests: true, quick_test_total_max: pt(20) });
  assert.equal((noCount.rules!.components.find((c) => c.id === "ropzh") as { count: number }).count, 1);
  assert.match(noCount.rules!.flags.map((f) => f.message).join("\n"), /1 alkalomnak vettük/);
  // missing figures are errors
  assert.deepEqual(surveyRules({ ...SIMPLE, has_assignment: true }).errors, ["Add meg egy határidőre leadott beadandó pontszámát."]);
  assert.equal(surveyRules({ ...SIMPLE, zh_count: null }).errors[0], "Add meg, hány zárthelyit írnak.");
  assert.deepEqual(surveyRules({ ...SIMPLE, zh_max_points: null }).errors, ["Add meg egy zárthelyi maximális pontszámát."]);
  assert.deepEqual(surveyRules({ ...SIMPLE, grade4_min_points: null }).errors, ["Add meg mind a négy ponthatárt (2-estől 5-ösig)."]);
  assert.deepEqual(surveyRules({ ...SIMPLE, grade_types: null }).errors, ["Add meg, milyen jegyet kap a hallgató."]);
});

test("an absence limit, and the exam grade for the exam-only and practice-and-exam courses", () => {
  const limit = surveyRules({ ...SIMPLE, attendance_mandatory: true, max_absences: pt(3) }).rules!;
  assert.deepEqual(limit.components[0], { id: "jelen", label: "Jelenlét", kind: "attendance", limit: { maxAbsences: 3, countExcused: true, onExceed: "none" } });

  const both = surveyRules({ ...SIMPLE, grade_types: "practice_and_exam" }).rules!;
  assert.deepEqual(both.outcomes.map((o) => [o.id, o.kind]), [["gyak", "gyakorlat"], ["vizs", "vizsga"]]);
  assert.deepEqual(both.components.find((c) => c.id === "vizsga"), { id: "vizsga", label: "Vizsga", kind: "exam", scale: { kind: "grade" } });
  assert.deepEqual(both.outcomes[1].gates, [{ id: "gyakjegy", label: "Legalább elégséges gyakorlati jegy", test: "grade(gyak) >= 2", onFail: "none" }]);

  const examOnly = surveyRules({ ...SIMPLE, grade_types: "exam_only", zh_min_points: pt(15), has_retake: true }).rules!;
  assert.deepEqual(examOnly.outcomes.map((o) => o.id), ["vizs"]);
  assert.deepEqual(examOnly.outcomes[0].gates!.map((g) => g.test), ["zh1 >= 15", "zh2 >= 15"]);
  assert.equal(examOnly.outcomes[0].paths[0].grade, "vizsga");
  assert.equal(examOnly.tables.length, 0);
  assert.ok(examOnly.flags.some((f) => /nem kötöttük a vizsgajegyhez/.test(f.message)));
  const done = evaluate(examOnly, [], NOW);
  assert.equal(done.outcomes[0].best, 5);

  const unclear = surveyRules({ ...SIMPLE, grade_types: "unclear" }).rules!;
  assert.deepEqual(unclear.outcomes.map((o) => o.id), ["gyak"]);
  assert.ok(unclear.flags.some((f) => /nem egyértelműen/.test(f.message)));
});

test("a gate that is closed in the form leaves its detail out of the rules", () => {
  const withStale = surveyRules({ ...SIMPLE, has_quick_tests: false, quick_test_total_max: pt(20), has_assignment: false, assignment_points_on_time: pt(5) }).rules!;
  assert.deepEqual(withStale.components.map((c) => c.id), ["zh1", "zh2"]);
  const noZh = surveyRules({ ...SIMPLE, zh_scoring: "no_zh", has_quick_tests: true, quick_test_total_max: pt(30), grade2_min_points: pt(5), grade3_min_points: pt(10), grade4_min_points: pt(20), grade5_min_points: pt(25) }).rules!;
  assert.deepEqual(noZh.components.map((c) => c.id), ["ropzh"]);
  assert.deepEqual(surveyRules({ ...SIMPLE, zh_scoring: "no_zh" }).errors, ["Nincs pontozott összetevő, amelyből a ponthatárok szerinti jegy kiszámolható."]);
});

test("a pass/fail zh needs a pass for the grade", () => {
  const r = surveyRules({ ...SIMPLE, zh_scoring: "pass_fail", zh_max_points: null, quick_test_count: null, has_quick_tests: true, quick_test_total_max: pt(50) }).rules!;
  assert.deepEqual(r.components.find((c) => c.id === "zh1"), { id: "zh1", label: "1. zh", kind: "exam", scale: { kind: "points", max: 1, passAt: 1 } });
  assert.deepEqual(r.outcomes[0].gates!.map((g) => g.test), ["zh1 >= 1", "zh2 >= 1"]);
  assert.ok(r.flags.some((f) => /megfelelt/.test(f.message)));
  assert.equal(r.derived[0].expr, "ropzh", "a pass/fail zh adds no points");
});
