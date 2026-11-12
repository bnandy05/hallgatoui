// Real Jev answers (jev-latest, October 2026) for five documents, read by the survey reader: one set
// from the owner's prompt run outside the app (`<doc>.json`), one from the app itself through the
// browser (`<doc>.app.json`, prompt "app"). The bar: nothing wrong may reach the form unflagged, and the flags stay few
// enough that the student reads them. Fixtures: fixtures/kovetelmeny/jev-valaszok (only the
// answers, the picked number candidates and the owner's expected values; no document text).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FIELD_IDS, readSurvey, type Candidate, type FieldId } from "@/lib/rules/extract/survey";

const DIR = "fixtures/kovetelmeny/jev-valaszok";
// The app's own run (2026-10-07, after the prompt was aligned with the owner's).
const RIGHT_APP = 109;
const FLAGGED_APP = 27;

interface Fixture {
  course: string;
  /** "app" when the answers came from the app's own request. */
  prompt?: string;
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
  assert.equal(fixtures.length, 10);
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

function tally(set: Fixture[]) {
  let right = 0;
  let total = 0;
  let flagged = 0;
  for (const fx of set) {
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
  return { right, total, flagged };
}

test("real answers: most fields are right and few are flagged", () => {
  const owner = tally(fixtures.filter(([, f]) => f.prompt !== "app").map(([, f]) => f));
  assert.equal(owner.total, 115);
  assert.ok(owner.right >= 107, `owner's prompt, right: ${owner.right}/${owner.total}`);
  assert.ok(owner.flagged <= 25, `owner's prompt, flagged: ${owner.flagged}`);
  const app = tally(fixtures.filter(([, f]) => f.prompt === "app").map(([, f]) => f));
  assert.equal(app.total, 115);
  assert.ok(app.right >= RIGHT_APP, `app, right: ${app.right}/${app.total}`);
  assert.ok(app.flagged <= FLAGGED_APP, `app, flagged: ${app.flagged}`);
});

test("component grades counted as points still have point limits (eva)", () => {
  const fx = fixtures.find(([n]) => n === "eva")![1];
  for (const [n, other] of fixtures) if (n === "eva.app") assert.equal(other.prompt, "app");
  const d = readSurvey(fx.answers, fx.candidates);
  assert.equal(d.fields.grade_calculation.value, "component_grades_to_points");
  assert.deepEqual(
    (["grade2_min_points", "grade3_min_points", "grade4_min_points", "grade5_min_points", "final_total_max"] as const).map((id) => shown(d.fields[id].value)),
    ["12", "17", "21", "26", "31"]
  );
  assert.equal(d.fields.final_total_max.flagged, false, "the components' sum is only checked for raw points");
});
