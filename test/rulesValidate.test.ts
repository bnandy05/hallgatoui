import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRules } from "@/lib/rules/validate";
import { RULE_TEMPLATES } from "@/lib/rules/fixtures";
import type { SubjectRules } from "@/lib/rules/types";

const clone = (r: SubjectRules) => JSON.parse(JSON.stringify(r)) as SubjectRules;
const base = () => clone(RULE_TEMPLATES.find((t) => t.id === "elte-ik-progelm")!.rules);

function errorsOf(value: unknown): string[] {
  const r = validateRules(value);
  assert.equal(r.ok, false, "expected the rules to be refused");
  return r.ok ? [] : r.errors;
}

test("every fixture passes, without warnings, and round-trips unchanged", () => {
  for (const t of RULE_TEMPLATES) {
    const r = validateRules(clone(t.rules));
    assert.ok(r.ok, `${t.id}: ${r.ok ? "" : r.errors.join("; ")}`);
    if (!r.ok) continue;
    assert.deepEqual(r.warnings, [], t.id);
    assert.deepEqual(r.rules, JSON.parse(JSON.stringify(t.rules)), t.id);
  }
});

test("unknown keys are dropped from the cleaned copy", () => {
  const raw = base() as unknown as Record<string, unknown>;
  raw.extra = 1;
  (raw.components as Record<string, unknown>[])[0].junk = "x";
  const r = validateRules(raw);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal("extra" in r.rules, false);
  assert.equal("junk" in r.rules.components[0], false);
});

test("non-objects and wrong types are refused", () => {
  errorsOf(null);
  errorsOf([]);
  errorsOf("rules");
  const r = base() as unknown as Record<string, unknown>;
  r.schemaVersion = 2;
  assert.match(errorsOf(r).join(), /schemaVersion/);
  const c = base();
  (c.components[0] as unknown as Record<string, unknown>).kind = "mystery";
  assert.match(errorsOf(c).join(), /összetevőtípus/);
  const n = base();
  (n.components[4] as unknown as { scale: { max: unknown } }).scale.max = "60";
  assert.match(errorsOf(n).join(), /components\[4\]\.scale\.max/);
  const l = base();
  l.components[0].label = "x".repeat(121);
  assert.match(errorsOf(l).join(), /120/);
});

test("ids must match the pattern and be unique across the namespace", () => {
  const bad = base();
  bad.components[0].id = "Jelen";
  assert.match(errorsOf(bad).join(), /azonosító/);
  const dup = base();
  dup.derived[0].id = "zh1";
  assert.match(errorsOf(dup).join(), /foglalt: „zh1”/);
  const tbl = base();
  tbl.tables.push({ id: "plusz", rows: [{ min: 0, value: 1 }] });
  assert.match(errorsOf(tbl).join(), /foglalt: „plusz”/);
});

test("size caps", () => {
  const many = base();
  many.components = Array.from({ length: 41 }, (_, i) => ({ id: `b${i}`, label: "B", kind: "bonus" as const }));
  assert.match(errorsOf(many).join(), /legfeljebb 40/);
  const series = base();
  (series.components[1] as { count: number }).count = 61;
  assert.match(errorsOf(series).join(), /count/);
  const flags = base();
  flags.flags = Array.from({ length: 31 }, () => ({ field: "x", message: "y", resolved: false }));
  assert.match(errorsOf(flags).join(), /flags/);
});

test("formulas must parse and every reference must resolve", () => {
  const parse = base();
  parse.derived[0].expr = "count(minus, pm) +";
  assert.match(errorsOf(parse).join(), /derived\[0\]\.expr/);
  const unknown = base();
  unknown.outcomes[0].gates![0].test = "minusz <= senki";
  assert.match(errorsOf(unknown).join(), /Ismeretlen azonosító: „senki”/);
  const part = base();
  part.derived[2].expr = "zh1.tetel + zh2";
  assert.match(errorsOf(part).join(), /nincs „tetel” része/);
  const pred = base();
  pred.derived[0].expr = "count(absent, pm)";
  assert.match(errorsOf(pred).join(), /absent/);
  const table = base();
  table.derived[2].expr = "table(nincs, zh1)";
  assert.match(errorsOf(table).join(), /Ismeretlen táblázat/);
  const taken = base();
  taken.derived[2].expr = "taken(nincs)";
  assert.match(errorsOf(taken).join(), /Ismeretlen javító/);
});

test("derived values may only use earlier ids; grade() only earlier outcomes", () => {
  const fwd = base();
  fwd.derived[2].expr = "zh1 + zh2 + bonuszbe";
  assert.match(errorsOf(fwd).join(), /később/);
  const self = base();
  self.derived[2].expr = "zhossz + 1";
  assert.match(errorsOf(self).join(), /később/);
  const g = base();
  g.outcomes[0].paths[0].grade = "grade(vizsga)";
  assert.match(errorsOf(g).join(), /korábbi jegyre/);
  const inDerived = base();
  inDerived.derived[2].expr = "grade(gyak)";
  assert.match(errorsOf(inDerived).join(), /grade/);
});

test("divisors must be positive constants", () => {
  const r = base();
  r.outcomes[0].paths[0].grade = "floor(zhossz / zh1)";
  assert.match(errorsOf(r).join(), /pozitív számmal/);
});

test("retake targets must be exams sharing one scale", () => {
  const notExam = base();
  notExam.retakes[0].targets = ["zh1", "pm"];
  assert.match(errorsOf(notExam).join(), /nem zh\/vizsga/);
  const scale = base();
  scale.retakes[0].targets = ["zh1", "elo"];
  assert.match(errorsOf(scale).join(), /pontozása eltér/);
});

test("table rows must be ascending", () => {
  const r = clone(RULE_TEMPLATES.find((t) => t.id === "elte-ik-matalap")!.rules);
  r.tables[0].rows[2].min = 10;
  assert.match(errorsOf(r).join(), /növekvő/);
});

test("polarity: a non-monotone formula is a warning, not an error", () => {
  const r = base();
  r.outcomes[0].paths[0].gates![0].test = "zh1 - zh2 >= 0";
  const v = validateRules(r);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.warnings.length, 1);
  assert.match(v.warnings[0], /nem monoton.*„zh2”/);
  const post = base();
  post.outcomes[1].paths[0].post![1] = { kind: "add", when: "kvizok", delta: -1, label: "x" };
  const p = validateRules(post);
  assert.ok(p.ok && p.warnings.length === 1);
});
