import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkFormula,
  describeFormula,
  evalAst,
  parseFormula,
  type Ast,
  type FormulaEnv,
  type FormulaScope,
} from "@/lib/rules/expr";

function ast(src: string): Ast {
  const r = parseFormula(src);
  if (!r.ok) throw new Error(`${src}: ${r.error.message} @${r.error.at}`);
  return r.ast;
}

const vars: Record<string, number> = { F: 26, z1: 30, z2: 25, a: 0, b: 1, n1: 10, n2: 20 };
const env: FormulaEnv = {
  ref: (id, part) => (part ? 2 : vars[id] ?? 0),
  raw: (id) => (vars[id] ?? 0) - 1,
  count: (pred, ids) => (pred === "failed" ? ids.filter((id) => (vars[id] ?? 0) < 17).length : ids.length),
  table: (_id, x) => (x >= 61 ? 4 : 1),
  grade: () => 3,
  taken: () => 1,
};
const ev = (src: string) => evalAst(ast(src), env);

test("precedence: F/2 + z1 + z2 is (F/2)+z1+z2", () => {
  const a = ast("F/2 + z1 + z2");
  assert.equal(a.k, "bin");
  if (a.k !== "bin") return;
  assert.equal(a.op, "+");
  assert.equal(a.r.k, "ref");
  assert.ok(a.l.k === "bin" && a.l.op === "+" && a.l.l.k === "bin" && a.l.l.op === "/");
  assert.equal(ev("F/2 + z1 + z2"), 68);
});

test("arithmetic, comparison and logic", () => {
  assert.equal(ev("2 + 3 * 4"), 14);
  assert.equal(ev("(2 + 3) * 4"), 20);
  assert.equal(ev("10 - 4 - 3"), 3);
  assert.equal(ev("-z1 + 1"), -29);
  assert.equal(ev("!a && b"), 1);
  assert.equal(ev("!(a || b)"), 0);
  assert.equal(ev("z1 >= 30 && z2 < 26"), 1);
  assert.equal(ev("z1 == 30"), 1);
  assert.equal(ev("z1 != 30"), 0);
  assert.equal(ev("floor(71/20)"), 3);
  assert.equal(ev("min(3, z2, 9)"), 3);
  assert.equal(ev("max(0, z2 - 20)"), 5);
  assert.equal(ev("if(b, 7, 9)"), 7);
  assert.equal(ev("if(a, 7, 9)"), 9);
  assert.equal(ev("2.5 * 2"), 5);
});

test("special functions", () => {
  const c = ast("count(failed, n1, n2)");
  assert.deepEqual(c, { k: "count", raw: false, pred: "failed", ids: ["n1", "n2"], at: 0 });
  assert.equal(ev("count(failed, n1, n2)"), 1);
  assert.equal(ast("countRaw(passed, n1)").k, "count");
  assert.equal(ev("table(jegy, F/2 + z1 + z2)"), 4);
  assert.equal(ev("grade(gyak) >= 2"), 1);
  assert.equal(ev("taken(jav)"), 1);
  assert.equal(ev("raw(z1)"), 29);
  assert.deepEqual(ast("z1.tetel"), { k: "ref", id: "z1", part: "tetel", at: 0 });
  assert.equal(ev("z1.tetel + z2.tetel"), 4);
});

test("parse errors carry a position and a Hungarian message", () => {
  const unknownFn = parseFormula("1 + foo(2)");
  assert.equal(unknownFn.ok, false);
  if (!unknownFn.ok) {
    assert.equal(unknownFn.error.at, 4);
    assert.match(unknownFn.error.message, /Ismeretlen függvény/);
  }
  const deep = parseFormula("(".repeat(30) + "1" + ")".repeat(30));
  assert.equal(deep.ok, false);
  if (!deep.ok) assert.match(deep.error.message, /mélyen/);
  const long = parseFormula("1+".repeat(200) + "1");
  assert.equal(long.ok, false);
  if (!long.ok) assert.match(long.error.message, /hosszú/);
  const bad = parseFormula("z1 >= ");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error.at, 6);
  const chr = parseFormula("z1 # 2");
  assert.equal(chr.ok, false);
  if (!chr.ok) assert.equal(chr.error.at, 3);
  assert.equal(parseFormula("count(bogus, a)").ok, false);
  assert.equal(parseFormula("1 < 2 < 3").ok, false);
  assert.equal(parseFormula("if(1, 2)").ok, false);
  assert.equal(parseFormula("").ok, false);
  assert.equal(parseFormula("(1 + 2").ok, false);
});

test("the AST is cached per string", () => {
  assert.equal(parseFormula("z1 + z2"), parseFormula("z1 + z2"));
});

test("checkFormula reports unknown ids with their position and non-constant divisors", () => {
  const scope: FormulaScope = {
    ref: (id) => (id in vars ? null : `Ismeretlen azonosító: „${id}”`),
    raw: () => null,
    count: () => null,
    table: () => null,
    grade: () => null,
    taken: () => null,
  };
  const errs = checkFormula(ast("z1 + nope"), scope);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].at, 5);
  assert.match(errs[0].message, /nope/);
  assert.equal(checkFormula(ast("z1 / z2"), scope).length, 1);
  assert.equal(checkFormula(ast("z1 / 0"), scope).length, 1);
  assert.equal(checkFormula(ast("z1 / 2"), scope).length, 0);
});

test("describeFormula renders short Hungarian text", () => {
  assert.equal(
    describeFormula("floor((zh1+zh2+bonus)/20)", { zh1: "ZH1", zh2: "ZH2", bonus: "bónusz" }),
    "(ZH1 + ZH2 + bónusz) / 20, lefelé kerekítve"
  );
  assert.equal(describeFormula("F/2 + z1 + z2", { F: "F", z1: "Z1", z2: "Z2" }), "F / 2 + Z1 + Z2");
  assert.equal(describeFormula("zh2 >= 20 && zhossz >= 40", { zhossz: "összeg" }), "zh2 ≥ 20 és összeg ≥ 40");
  assert.equal(describeFormula("count(failed, b1, b2) == 0", { b1: "1. beadandó", b2: "2. beadandó" }), "sikertelenek száma (1. beadandó, 2. beadandó) = 0");
  assert.equal(describeFormula("a - (b - 1)"), "a − (b − 1)");
  assert.equal(describeFormula("2.5"), "2,5");
  assert.equal(describeFormula("bad ("), "bad (");
});
