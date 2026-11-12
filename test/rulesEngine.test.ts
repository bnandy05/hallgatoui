import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type Evaluation, type OutcomeEval } from "@/lib/rules/engine";
import type { RequirementResult } from "@/lib/rules/types";
import { NOW, asg, grade, pts, rdItems, res, rules, seriesPts, state } from "./rulesHelpers";

function out(e: Evaluation, id: string): OutcomeEval {
  const o = e.outcomes.find((x) => x.outcomeId === id);
  assert.ok(o, `no outcome ${id}`);
  return o;
}

function expectOutcome(o: OutcomeEval, want: Partial<OutcomeEval>): void {
  const got: Partial<OutcomeEval> = {};
  for (const k of Object.keys(want) as (keyof OutcomeEval)[]) (got as Record<string, unknown>)[k] = o[k];
  assert.deepEqual(got, want);
}

// ----- .NET GUI -----

const DOTNET = rules("elte-ik-dotnet-gui");
const dn = (rs: RequirementResult[]) => evaluate(DOTNET, rs, NOW);

test("D1: all recorded → 4; the javító could still raise it (spec said final)", () => {
  const e = dn([asg("b1", "ok"), asg("b2", "ok"), grade("gy1", 4), grade("gy2", 3), pts("elm", 25)]);
  // elm 25 → 4; 3+3+2·4+2·3+4 = 24 → 4. gyjav on gy2 (→5): 28 → 5, so best is 5.
  expectOutcome(out(e, "gyak"), { current: 4, worst: 4, best: 5, status: "provisional", path: "alap" });
  assert.deepEqual(e.derived.ossz, { best: 24, worst: 24 });
});

test("D2: failed theory zh → 1 now, fixable by the javító, best 5", () => {
  const e = dn([asg("b1", "ok"), asg("b2", "javitott"), grade("gy1", 2), grade("gy2", 5), pts("elm", 17)]);
  const o = out(e, "gyak");
  expectOutcome(o, { current: 1, worst: 1, best: 5, status: "provisional" });
  assert.equal(o.gates.find((g) => g.id === "zhk")?.status, "fixable");
  assert.equal(o.gates.find((g) => g.id === "bead")?.status, "met");
  assert.equal(e.components.find((c) => c.id === "elm")?.status, "failed");
});

test("D2b: theory javító 22 replaces 17 → 4, gy1 can still be retaken → best 5", () => {
  const e = dn([
    asg("b1", "ok"),
    asg("b2", "javitott"),
    grade("gy1", 2),
    grade("gy2", 5),
    pts("elm", 17),
    res("elmjav", { kind: "points", points: 22 }, 1, { retakeOf: "elm" }),
  ]);
  expectOutcome(out(e, "gyak"), { current: 4, worst: 4, best: 5, status: "provisional" });
  const elm = e.components.find((c) => c.id === "elm")!;
  assert.equal(elm.effective, 22);
  assert.equal(elm.replacedBy, "elmjav");
  assert.equal(elm.status, "passed");
  assert.equal(e.components.find((c) => c.id === "elmjav")?.replaces, "elm");
});

test("D3: a rejected assignment means no grade, final", () => {
  const e = dn([asg("b2", "elutasitva")]);
  const o = out(e, "gyak");
  expectOutcome(o, { current: 0, worst: 0, best: 0, status: "final" });
  assert.equal(o.gates.find((g) => g.id === "bead")?.status, "failed");
});

test("a 'choose' retake without retakeOf is ignored with a warning", () => {
  const e = dn([asg("b1", "ok"), asg("b2", "ok"), grade("gy1", 1), grade("gy2", 3), pts("elm", 25), grade("gyjav", 5)]);
  assert.ok(e.warnings.some((w) => /melyik zh/.test(w)));
  assert.equal(out(e, "gyak").current, 1);
});

// ----- Programozáselmélet (12 practical sessions) -----

const PROGELM = rules("elte-ik-progelm");
const pe = (rs: RequirementResult[]) => evaluate(PROGELM, rs, NOW);
const pm = (signs: string) => [...signs].map((s, i) => res("pm", { kind: "pm", sign: s as "+" | "-" }, i + 1));
const quiz = (passed: number, total = 8) =>
  Array.from({ length: total }, (_, i) => res("kviz", { kind: "quiz", bestPercent: i < passed ? 80 : 40, onTime: true }, i + 1));
const att = (statuses: ("excused" | "unexcused")[]) =>
  statuses.map((s, i) => res("jelen", { kind: "attendance", status: s }, i + 1));
const bonus = (...vals: number[]) => vals.map((v, i) => res("bonusz", { kind: "bonus", points: v }, i + 1));

// 10 pm (8 +, 2 −), the two absent sessions' pm are na; 1 excused + 1 unexcused absence.
const P_BASE = [...pm("++++-+++-+"), state("pm", "na", 11), state("pm", "na", 12), ...att(["excused", "unexcused"])];

test("P1: gyak 3 now (pót could still raise it — spec said final); vizsga 4, best 5", () => {
  const e = pe([...P_BASE, ...quiz(6), ...bonus(6, 4), pts("zh1", 35), pts("zh2", 28), grade("elo", 5)]);
  // minusz 2+1 = 3 ≤ 8; absences 2 ≤ 3; bonus min(10, 8) = 8 counted; floor(71/20) = 3.
  // A pót (worse = zh2) at 60: 35+60+8 = 103 → 5.
  expectOutcome(out(e, "gyak"), { current: 3, worst: 3, best: 5, status: "provisional" });
  expectOutcome(out(e, "vizsga"), { current: 4, worst: 4, best: 5, status: "provisional", path: "elo" });
  assert.deepEqual(e.derived.bonuszbe, { best: 8, worst: 8 });
  const pmEval = e.components.find((c) => c.id === "pm")!;
  assert.deepEqual([pmEval.recorded, pmEval.na, pmEval.total, pmEval.status], [10, 2, 12, "done"]);
  assert.equal(e.components.find((c) => c.id === "jelen")?.points, 2);
});

test("P2a: zh2 15 fails → 1, the pót could give 5", () => {
  const e = pe([...P_BASE, ...quiz(6), ...bonus(5), pts("zh1", 40), pts("zh2", 15)]);
  const o = out(e, "gyak");
  expectOutcome(o, { current: 1, worst: 1, best: 5, status: "provisional" });
  assert.equal(o.gates.find((g) => g.id === "zh2")?.status, "fixable");
});

test("P2b: pót 30 replaces the worse zh2 → 3, final", () => {
  const e = pe([...P_BASE, ...quiz(6), ...bonus(5), pts("zh1", 40), pts("zh2", 15), pts("pot", 30)]);
  // 40 + 30 + 5 = 75 → 3 (even with the open bonus at 8: 78 → 3).
  expectOutcome(out(e, "gyak"), { current: 3, worst: 3, best: 3, status: "final" });
  assert.equal(e.components.find((c) => c.id === "zh2")?.replacedBy, "pot");
});

test("P2c: a lower pót still replaces → 1, final; vizsga 4 → cap 4 → −1 = 3", () => {
  const e = pe([...P_BASE, ...quiz(4), ...bonus(5), pts("zh1", 30), pts("zh2", 25), pts("pot", 12), grade("elo", 4)]);
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, best: 1, status: "final" });
  const v = out(e, "vizsga");
  expectOutcome(v, { current: 3, worst: 3, best: 5, status: "provisional" });
  assert.deepEqual(v.applied, ["5-nél kevesebb kvíz határidőre"]);
});

test("P3: 4 absences → no grade, final", () => {
  const e = pe(att(["excused", "excused", "unexcused", "unexcused"]));
  const o = out(e, "gyak");
  expectOutcome(o, { current: 0, worst: 0, best: 0, status: "final" });
  assert.equal(o.gates[0].id, "@jelen");
  assert.equal(o.gates[0].status, "failed");
  assert.equal(e.components.find((c) => c.id === "jelen")?.status, "failed");
});

test("P3b: 20 + 19 → 1 (bonus not counted), provisional because of the pót", () => {
  const e = pe([...P_BASE, ...bonus(8), pts("zh1", 20), pts("zh2", 19)]);
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, status: "provisional" });
  assert.equal(e.derived.bonuszbe.worst, 0);
});

test("unknown pm items are open: the minus gate can still go either way", () => {
  const e = pe([pts("zh1", 40), pts("zh2", 40)]);
  expectOutcome(out(e, "gyak"), { current: null, worst: 0, best: 5, status: "open" });
  assert.equal(out(e, "gyak").gates.find((g) => g.id === "pm")?.status, "open");
});

// ----- Matematikai alapok -----

const MATEK = rules("elte-ik-matalap");
const mk = (rs: RequirementResult[]) => evaluate(MATEK, rs, NOW);
const absences = (n: number) => att(Array.from({ length: n }, () => "unexcused" as const));
const rzh = (total: number) => seriesPts("rzh", Array.from({ length: 10 }, (_, i) => Math.min(4, Math.max(0, total - 4 * i))));

test("M1: 115 points → 4, final", () => {
  const e = mk([...absences(3), ...rzh(30), pts("n1", 40), pts("n2", 35), pts("n3", 30)]);
  expectOutcome(out(e, "gyak"), { current: 4, worst: 4, best: 4, status: "final", path: "alap" });
  assert.equal(e.components.find((c) => c.id === "rzh")?.points, 30);
});

test("M2: 130 → 5, röpzh failed → 4", () => {
  const e = mk([...rzh(18), pts("n1", 45), pts("n2", 40), pts("n3", 45)]);
  const o = out(e, "gyak");
  expectOutcome(o, { current: 4, worst: 4, best: 4, status: "final" });
  assert.deepEqual(o.applied, ["Röpzh nem teljesült"]);
});

test("M3: one failed nagyzh → 1 now, the javító could give 4", () => {
  const e = mk([...rzh(24), pts("n1", 15), pts("n2", 30), pts("n3", 30)]);
  const o = out(e, "gyak");
  expectOutcome(o, { current: 1, worst: 1, best: 4, status: "provisional" });
  assert.equal(o.gates.find((g) => g.id === "mind")?.status, "fixable");
});

test("M3b: javító 20 is better than 15 → 84 → 3, final", () => {
  const e = mk([...rzh(24), pts("n1", 15), pts("n2", 30), pts("n3", 30), pts("jav", 20)]);
  expectOutcome(out(e, "gyak"), { current: 3, worst: 3, best: 3, status: "final" });
});

test("M3c: a worse javító keeps 15 → utóvizsga path, 1 now, best 2", () => {
  const e = mk([...rzh(24), pts("n1", 15), pts("n2", 30), pts("n3", 30), pts("jav", 10)]);
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, best: 2, status: "provisional", path: "uv" });
  assert.equal(e.components.find((c) => c.id === "n1")?.replacedBy, undefined);
});

test("M4: two failed → utóvizsga passed → 2, final", () => {
  const e = mk([pts("n1", 10), pts("n2", 12), pts("n3", 40), pts("gyakuv", 33, { t1: 10, t2: 8, t3: 15 })]);
  expectOutcome(out(e, "gyak"), { current: 2, worst: 2, best: 2, status: "final", path: "uv" });
});

test("M4b: one topic under 7 → 1, final", () => {
  const e = mk([pts("n1", 10), pts("n2", 12), pts("n3", 40), pts("gyakuv", 46, { t1: 6, t2: 20, t3: 20 })]);
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, best: 1, status: "final" });
});

test("M5: 7 absences → no grade, final", () => {
  const e = mk(absences(7));
  expectOutcome(out(e, "gyak"), { current: 0, worst: 0, best: 0, status: "final" });
});

// ----- Analízis I -----

const ANALIZIS = rules("elte-ttk-analizis1");
const an = (rs: RequirementResult[]) => evaluate(ANALIZIS, rs, NOW);

test("A1: Ö = 68 → 4, final; megajánlott 4", () => {
  const e = an([...rdItems(14, 12), pts("z1", 30, { tetel: 3, feladat: 27 }), pts("z2", 25, { tetel: 3, feladat: 22 })]);
  expectOutcome(out(e, "gyak"), { current: 4, worst: 4, best: 4, status: "final" });
  expectOutcome(out(e, "megaj"), { current: 4, worst: 4, best: 4, status: "final" });
  assert.deepEqual(e.derived.o, { best: 68, worst: 68 });
});

test("A2: röpdolgozat elmélet 7 → 1, final; megajánlott 0", () => {
  const e = an(rdItems(7, 15));
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, best: 1, status: "final" });
  expectOutcome(out(e, "megaj"), { current: 0, worst: 0, best: 0, status: "final" });
});

test("A3: z1 8 fails → 1 now, pót could give 79.5 → 4", () => {
  const e = an([...rdItems(10, 9), pts("z1", 8), pts("z2", 30)]);
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, best: 4, status: "provisional" });
});

test("A3b: pót 20 replaces z1 → 59.5 → 3, final", () => {
  const e = an([...rdItems(10, 9), pts("z1", 8), pts("z2", 30), pts("pot", 20)]);
  expectOutcome(out(e, "gyak"), { current: 3, worst: 3, best: 3, status: "final" });
  assert.equal(e.derived.o.worst, 59.5);
});

test("A4: 45.5 stays under 46 → 2", () => {
  const e = an([...rdItems(17, 16), pts("z1", 14), pts("z2", 15)]);
  expectOutcome(out(e, "gyak"), { current: 2, worst: 2, best: 2, status: "final" });
});

test("A5: both zh failed → pót not allowed → 1, final", () => {
  const e = an([pts("z1", 9), pts("z2", 10)]);
  expectOutcome(out(e, "gyak"), { current: 1, worst: 1, best: 1, status: "final" });
});

test("A6: tétel 4 + 1 → megajánlott not offered, gyak 4", () => {
  const e = an([...rdItems(14, 12), pts("z1", 30, { tetel: 4, feladat: 26 }), pts("z2", 25, { tetel: 1, feladat: 24 })]);
  expectOutcome(out(e, "gyak"), { current: 4, status: "final" });
  const m = out(e, "megaj");
  expectOutcome(m, { current: 0, worst: 0, best: 0, status: "final" });
  assert.equal(m.gates.find((g) => g.id === "tetel")?.status, "failed");
});

// ----- general -----

test("results of a removed component become warnings and stay in the input", () => {
  const rs = [pts("z1", 30), pts("regi", 12)];
  const e = an(rs);
  assert.ok(e.warnings.some((w) => w.includes("regi")));
  assert.equal(rs.length, 2);
});

test("a value of the wrong kind is ignored with a warning", () => {
  const e = an([grade("z1", 4)]);
  assert.ok(e.warnings.some((w) => /típusa/.test(w)));
  assert.equal(e.components.find((c) => c.id === "z1")?.recorded, 0);
});

test("overdue entries and pending results", () => {
  const r = JSON.parse(JSON.stringify(ANALIZIS));
  r.components[1].due = "2026-10-01T10:00:00Z";
  r.components[2].due = "2026-12-01T10:00:00Z";
  const e = evaluate(r, [state("z2", "pending")], NOW);
  const z1 = e.components.find((c) => c.id === "z1")!;
  const z2 = e.components.find((c) => c.id === "z2")!;
  assert.equal(z1.overdueEntry, true);
  assert.equal(z2.overdueEntry, false);
  assert.equal(z2.pending, 1);
});

test("series na items lower the attainable maximum", () => {
  const e = mk([state("rzh", "na", 1), state("rzh", "na", 2), ...seriesPts("rzh", [4, 4]).map((x, i) => ({ ...x, instanceKey: `n:${i + 3}` }))]);
  const c = e.components.find((x) => x.id === "rzh")!;
  assert.deepEqual([c.recorded, c.na, c.points, c.maxSoFar, c.maxTotal], [2, 2, 8, 8, 32]);
});

// ----- monotonicity property -----

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Gen = { rs: RequirementResult[]; raises: (() => RequirementResult[])[] };

// Random results for a fixture, plus "raise one known value in its good direction" variants.
// Retake targets are not raised: "only a failed zh may be retaken" and "the pót replaces the
// worse zh" are genuinely non-monotone (passing a zh removes the retake option).
function generate(id: string, rnd: () => number): Gen {
  const r = rules(id);
  const targets = new Set(r.retakes.flatMap((x) => x.targets));
  const rs: RequirementResult[] = [];
  const raises: Gen["raises"] = [];
  const int = (n: number) => Math.floor(rnd() * (n + 1));
  const replaceAt = (i: number, v: RequirementResult) => () => rs.map((x, j) => (j === i ? v : x));
  for (const c of r.components) {
    if (rnd() < 0.3) continue; // leave unknown
    const i = rs.length;
    switch (c.kind) {
      case "exam": {
        if (c.scale.kind === "grade") {
          const g = (1 + int(4)) as 1 | 2 | 3 | 4 | 5;
          rs.push(grade(c.id, g));
          if (!targets.has(c.id) && g < 5) raises.push(replaceAt(i, grade(c.id, (g + 1) as 2 | 3 | 4 | 5)));
        } else {
          const s = c.scale;
          if (s.parts) {
            const parts = Object.fromEntries(s.parts.map((p) => [p.id, int(p.max)]));
            const sum = Object.values(parts).reduce((a, b) => a + b, 0);
            rs.push(pts(c.id, sum, parts));
            const up = s.parts.find((p) => parts[p.id] < p.max);
            if (!targets.has(c.id) && up) raises.push(replaceAt(i, pts(c.id, sum + 1, { ...parts, [up.id]: parts[up.id] + 1 })));
          } else {
            const v = int(s.max);
            rs.push(pts(c.id, v));
            if (!targets.has(c.id) && v < s.max) raises.push(replaceAt(i, pts(c.id, Math.min(s.max, v + 1 + int(10)))));
          }
        }
        break;
      }
      case "assignment": {
        const k = int(c.outcomes.length - 1);
        rs.push(asg(c.id, c.outcomes[k].id));
        if (k > 0) raises.push(replaceAt(i, asg(c.id, c.outcomes[k - 1].id)));
        break;
      }
      case "series": {
        const n = int(c.count);
        for (let j = 1; j <= n; j++) {
          const at = rs.length;
          const s = c.scoring;
          if (s.kind === "plusMinus") {
            const plus = rnd() < 0.6;
            rs.push(res(c.id, { kind: "pm", sign: plus ? "+" : "-" }, j));
            if (!plus) raises.push(replaceAt(at, res(c.id, { kind: "pm", sign: "+" }, j)));
          } else if (s.kind === "percent") {
            const ok = rnd() < 0.6;
            rs.push(res(c.id, { kind: "quiz", bestPercent: ok ? 90 : 30, onTime: true }, j));
            if (!ok) raises.push(replaceAt(at, res(c.id, { kind: "quiz", bestPercent: 90, onTime: true }, j)));
          } else if (s.parts) {
            const parts = Object.fromEntries(s.parts.map((p) => [p.id, int(p.max)]));
            const sum = Object.values(parts).reduce((a, b) => a + b, 0);
            rs.push(pts(c.id, sum, parts, j));
            const up = s.parts.find((p) => parts[p.id] < p.max);
            if (up) raises.push(replaceAt(at, pts(c.id, sum + 1, { ...parts, [up.id]: parts[up.id] + 1 }, j)));
          } else {
            const v = int(s.max);
            rs.push(pts(c.id, v, undefined, j));
            if (v < s.max) raises.push(replaceAt(at, pts(c.id, v + 1, undefined, j)));
          }
        }
        break;
      }
      case "attendance": {
        const n = int(8);
        for (let j = 1; j <= n; j++) {
          const at = rs.length;
          const s = rnd() < 0.5 ? "excused" : "unexcused";
          rs.push(res(c.id, { kind: "attendance", status: s }, j));
          raises.push(replaceAt(at, res(c.id, { kind: "attendance", status: "present" }, j)));
        }
        break;
      }
      case "bonus": {
        const v = int(10);
        rs.push(res(c.id, { kind: "bonus", points: v }));
        raises.push(replaceAt(i, res(c.id, { kind: "bonus", points: v + 1 })));
        break;
      }
    }
  }
  return { rs, raises };
}

test("monotonicity: raising a known value never lowers best, worst or current", () => {
  const rnd = prng(20261005);
  for (const t of ["elte-ik-dotnet-gui", "elte-ik-progelm", "elte-ik-matalap", "elte-ttk-analizis1"]) {
    const r = rules(t);
    let checked = 0;
    for (let round = 0; round < 150; round++) {
      const g = generate(t, rnd);
      const before = evaluate(r, g.rs, NOW);
      for (const raise of g.raises) {
        const after = evaluate(r, raise(), NOW);
        for (const o of before.outcomes) {
          const a = after.outcomes.find((x) => x.outcomeId === o.outcomeId)!;
          const ctx = `${t}/${o.outcomeId} round ${round}`;
          assert.ok(a.best >= o.best, `${ctx}: best ${o.best} → ${a.best}`);
          assert.ok(a.worst >= o.worst, `${ctx}: worst ${o.worst} → ${a.worst}`);
          if (o.current !== null && a.current !== null) assert.ok(a.current >= o.current, `${ctx}: current ${o.current} → ${a.current}`);
          checked++;
        }
      }
    }
    assert.ok(checked > 100, `${t}: only ${checked} checks`);
  }
});
