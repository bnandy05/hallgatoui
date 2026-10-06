import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "@/lib/rules/engine";
import { extractRules } from "@/lib/rules/extract";
import { readGuided } from "@/lib/rules/extract/guided";
import { segment } from "@/lib/rules/extract/text";

// A document in wording the patterns don't know: the guided questionnaire reads it, with the
// document's own numbers as the options.
const TEXT = `Számonkérés és értékelés
A hallgatók teljesítményét két nagy dolgozat alapján mérjük fel, ezek 40-40 pontot érnek.
Mindkét dolgozatból minimum 16 pontot kell elérni a sikeres teljesítéshez.
Ezenfelül egy projekt munkát is le kell adni, amire maximum 20 pont kapható.
A végső érdemjegy a megszerzett pontok alapján: 50 ponttól elégséges, 62 ponttól közepes, 74 ponttól jó, 88 ponttól jeles.
A gyakorlatokról 3 alkalomnál többet hiányozni nem lehet.`;

const ANSWERS = {
  "g:shape": "points",
  "g:zh:present": "yes",
  "g:zh:count": "n2",
  "g:zh:max": "n40",
  "g:zh:min": "n16",
  "g:beadando:present": "yes",
  "g:beadando:count": "n1",
  "g:beadando:max": "n20",
  "g:beadando:min": "none",
  "g:absence": "n3",
  "g:t2": "n50",
  "g:t3": "n62",
  "g:t4": "n74",
  "g:t5": "n88",
};

test("text the patterns don't know goes to the guided questions, options from its own numbers", () => {
  const x = extractRules(TEXT);
  assert.equal(x.mode, "guided");
  assert.equal(x.ok, true);
  const ids = x.questions.map((q) => q.id);
  for (const id of ["g:shape", "g:zh:present", "g:zh:max", "g:beadando:present", "g:absence", "g:t2"]) assert.ok(ids.includes(id), id);
  const max = x.questions.find((q) => q.id === "g:zh:max")!;
  assert.deepEqual(max.options.map((o) => o.label), ["16", "40"]);
  assert.match(max.quote, /40-40 pontot/);
});

test("the answered questionnaire gives valid rules that grade as the document says", () => {
  const x = extractRules(TEXT, ANSWERS);
  assert.deepEqual(x.open, []);
  assert.deepEqual(x.errors, []);
  const rules = x.rules!;
  assert.deepEqual(rules.components.map((c) => c.id), ["jelen", "zh1", "zh2", "beadando"]);
  assert.deepEqual(rules.tables[0].rows.map((r) => [r.min, r.value]), [[0, 1], [50, 2], [62, 3], [74, 4], [88, 5]]);
  const now = new Date("2026-10-06T10:00:00Z");
  const results = [
    { id: "a", courseId: "c", componentId: "zh1", instanceKey: "n:1", state: "recorded" as const, value: { kind: "points" as const, points: 30 } },
    { id: "b", courseId: "c", componentId: "zh2", instanceKey: "n:1", state: "recorded" as const, value: { kind: "points" as const, points: 30 } },
    { id: "d", courseId: "c", componentId: "beadando", instanceKey: "n:1", state: "recorded" as const, value: { kind: "points" as const, points: 15 } },
  ];
  assert.equal(evaluate(rules, results, now).outcomes[0].best, 4); // 75 points
  const failed = results.map((r) => (r.componentId === "zh2" ? { ...r, value: { kind: "points" as const, points: 10 } } : r));
  assert.equal(evaluate(rules, failed, now).outcomes[0].best, 1); // zh2 below 16
});

test("answers that don't make a valid rule set show as errors, not a rejection", () => {
  const x = extractRules(TEXT, { ...ANSWERS, "g:t3": "n40" }); // 3 from fewer points than 2
  assert.equal(x.ok, true);
  assert.equal(x.rules, null);
  assert.ok(x.errors.length > 0);
});

test("only kinds the text mentions are asked about", () => {
  const ids = readGuided(segment(TEXT), {}).questions.map((q) => q.id);
  assert.ok(!ids.some((id) => id.startsWith("g:kviz") || id.startsWith("g:vizsga")), ids.join());
});
