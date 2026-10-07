// Real Jev answers (jev-latest, the owner's survey prompt, October 2026) for five documents, read by
// the survey reader. The bar: nothing wrong may reach the form unflagged, and the flags stay few
// enough that the student reads them. Fixtures: fixtures/kovetelmeny/jev-valaszok (only the
// answers, the picked number candidates and the owner's expected values; no document text).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FIELD_IDS, readSurvey, type Candidate, type FieldId } from "@/lib/rules/extract/survey";

const DIR = "fixtures/kovetelmeny/jev-valaszok";

interface Fixture {
  course: string;
  candidates: Candidate[];
  answers: Record<string, unknown>;
  /** Every acceptable answer, as the owner writes them: true, "points", "40", "50%", "none". */
  expected: Partial<Record<FieldId, (string | boolean)[]>>;
}

const shown = (v: unknown): string | boolean =>
  v === null ? "none" : typeof v === "object" ? `${(v as { value: number }).value}${(v as { percent: boolean }).percent ? "%" : ""}` : typeof v === "boolean" ? v : String(v);

const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as Fixture] as const);

test("real answers: nothing wrong reaches the form unflagged", () => {
  assert.equal(fixtures.length, 5);
  for (const [name, fx] of fixtures) {
    const draft = readSurvey(fx.answers, fx.candidates);
    for (const id of FIELD_IDS) {
      const ok = fx.expected[id];
      if (!ok) continue;
      const f = draft.fields[id];
      const got = shown(f.hidden ? null : f.value);
      if (!ok.includes(got)) assert.ok(f.flagged, `${name}.${id}: ${String(got)} is wrong (want ${ok.join("|")}) and not flagged`);
    }
  }
});

test("real answers: most fields are right and few are flagged", () => {
  let right = 0;
  let total = 0;
  let flagged = 0;
  for (const [, fx] of fixtures) {
    const draft = readSurvey(fx.answers, fx.candidates);
    for (const id of FIELD_IDS) {
      const ok = fx.expected[id];
      if (!ok) continue;
      total++;
      const f = draft.fields[id];
      if (ok.includes(shown(f.hidden ? null : f.value))) right++;
      if (f.flagged) flagged++;
    }
  }
  assert.equal(total, 115);
  assert.ok(right >= 107, `right: ${right}/${total}`);
  assert.ok(flagged <= 25, `flagged: ${flagged}/${total}`);
});

test("component grades counted as points still have point limits (eva)", () => {
  const fx = fixtures.find(([n]) => n === "eva")![1];
  const d = readSurvey(fx.answers, fx.candidates);
  assert.equal(d.fields.grade_calculation.value, "component_grades_to_points");
  assert.deepEqual(
    (["grade2_min_points", "grade3_min_points", "grade4_min_points", "grade5_min_points", "final_total_max"] as const).map((id) => shown(d.fields[id].value)),
    ["12", "17", "21", "26", "31"]
  );
  assert.equal(d.fields.final_total_max.flagged, false, "the components' sum is only checked for raw points");
});
