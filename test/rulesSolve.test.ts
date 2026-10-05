import { test } from "node:test";
import assert from "node:assert/strict";
import { solveFor } from "@/lib/rules/solve";
import type { RequirementResult } from "@/lib/rules/types";
import { NOW, asg, grade, pts, rdItems, res, rules, seriesPts, state } from "./rulesHelpers";

const solve = (id: string, rs: RequirementResult[], outcomeId: string, target: string, goal: number, others: "worst" | "best" = "worst") =>
  solveFor(rules(id), rs, NOW, { outcomeId, target, goal, others });

test("D-solve: gy2 needs 3 for a 4 and 5 for a 5", () => {
  const rs = [asg("b1", "ok"), asg("b2", "ok"), grade("gy1", 3), pts("elm", 24)];
  assert.deepEqual(solve("elte-ik-dotnet-gui", rs, "gyak", "gy2", 4), { status: "reachable", min: 3 });
  assert.deepEqual(solve("elte-ik-dotnet-gui", rs, "gyak", "gy2", 5), { status: "reachable", min: 5 });
  assert.deepEqual(solve("elte-ik-dotnet-gui", rs, "gyak", "gy2", 2), { status: "reachable", min: 2 });
});

test("D-solve: a rejected assignment makes every goal unreachable, naming the gate", () => {
  const r = solve("elte-ik-dotnet-gui", [asg("b1", "elutasitva")], "gyak", "gy2", 2, "best");
  assert.equal(r.status, "unreachable");
  assert.match(r.reason ?? "", /Minden beadandó elfogadva/);
});

const pm = (signs: string) => [...signs].map((s, i) => res("pm", { kind: "pm", sign: s as "+" | "-" }, i + 1));
const P1_NO_ZH2 = [
  ...pm("++++-+++-+"),
  state("pm", "na", 11),
  state("pm", "na", 12),
  res("jelen", { kind: "attendance", status: "excused" }, 1),
  res("jelen", { kind: "attendance", status: "unexcused" }, 2),
  ...Array.from({ length: 8 }, (_, i) => res("kviz", { kind: "quiz", bestPercent: i < 6 ? 80 : 40, onTime: true }, i + 1)),
  res("bonusz", { kind: "bonus", points: 6 }, 1),
  res("bonusz", { kind: "bonus", points: 4 }, 2),
  pts("zh1", 35),
  grade("elo", 5),
];

test("P-solve: zh2 needs 37 for a 4, 57 for a 5, 20 for a 2", () => {
  assert.deepEqual(solve("elte-ik-progelm", P1_NO_ZH2, "gyak", "zh2", 4), { status: "reachable", min: 37 });
  assert.deepEqual(solve("elte-ik-progelm", P1_NO_ZH2, "gyak", "zh2", 5), { status: "reachable", min: 57 });
  assert.deepEqual(solve("elte-ik-progelm", P1_NO_ZH2, "gyak", "zh2", 2), { status: "reachable", min: 20 });
});

test("P-solve: the vizsga 4 is already there", () => {
  assert.deepEqual(solve("elte-ik-progelm", P1_NO_ZH2, "vizsga", "szobeli", 4), { status: "already" });
  assert.deepEqual(solve("elte-ik-progelm", P1_NO_ZH2, "vizsga", "szobeli", 5), { status: "reachable", min: 5 });
});

test("P-solve: a retake slot as target — after zh2 15, the pót needs 25 for a 3", () => {
  const rs = [...P1_NO_ZH2.filter((r) => r.componentId !== "zh1"), pts("zh1", 40), pts("zh2", 15)];
  // pót replaces zh2 (worse): 40 + p + 8 ≥ 60 and p ≥ 20 → p ≥ 12 but gate p ≥ 20 → 20 gives 68 → 3.
  assert.deepEqual(solve("elte-ik-progelm", rs, "gyak", "pot", 3), { status: "reachable", min: 20 });
  // Target zh1 cannot fix the failed zh2 alone: via the pót.
  const via = solve("elte-ik-progelm", rs, "gyak", "zh1", 2);
  assert.equal(via.status, "reachable");
  assert.equal(via.viaRetake, "pot");
  // At zh1 = 15 the tie goes to zh2 (the later target), so the pót (at 60) replaces zh2.
  assert.equal(via.min, 15);
});

const rzh = (total: number) => seriesPts("rzh", Array.from({ length: 10 }, (_, i) => Math.min(4, Math.max(0, total - 4 * i))));
const M1_NO_N3 = [...rzh(30), pts("n1", 40), pts("n2", 35)];

test("M-solve: n3 needs 17 (passAt) for a 4 and 38 for a 5", () => {
  assert.deepEqual(solve("elte-ik-matalap", M1_NO_N3, "gyak", "n3", 4), { status: "reachable", min: 17 });
  assert.deepEqual(solve("elte-ik-matalap", M1_NO_N3, "gyak", "n3", 5), { status: "reachable", min: 38 });
});

test("M-solve: on the utóvizsga path a 3 is unreachable (max 2)", () => {
  const rs = [pts("n1", 10), pts("n2", 12), pts("n3", 40)];
  const r = solve("elte-ik-matalap", rs, "gyak", "gyakuv", 3, "best");
  assert.equal(r.status, "unreachable");
  assert.match(r.reason ?? "", /utóvizsga.*legfeljebb 2/);
  assert.deepEqual(solve("elte-ik-matalap", rs, "gyak", "gyakuv", 2), { status: "reachable", min: 30 });
});

test("M-solve: series target — röpzh points still needed", () => {
  // 12 points from 5 items, 5 items left; n1..n3 = 120, so a 5 (123) needs bonus ≥ 3 → rzh ≥ 23.
  const rs = [...seriesPts("rzh", [4, 4, 4, 0, 0]), pts("n1", 40), pts("n2", 40), pts("n3", 40)];
  assert.deepEqual(solve("elte-ik-matalap", rs, "gyak", "rzh", 5), { status: "reachable", min: 11 });
  // For a 4 (120 ≥ 99) only the röpzh minimum matters: 20 − 12 = 8 points.
  assert.deepEqual(solve("elte-ik-matalap", rs, "gyak", "rzh", 4), { status: "reachable", min: 8 });
});

const A1_NO_Z2 = [...rdItems(14, 12), pts("z1", 30, { tetel: 3, feladat: 27 })];

test("A-solve: z2 needs 18 for a 4 and 38 for a 5", () => {
  assert.deepEqual(solve("elte-ttk-analizis1", A1_NO_Z2, "gyak", "z2", 4), { status: "reachable", min: 18 });
  assert.deepEqual(solve("elte-ttk-analizis1", A1_NO_Z2, "gyak", "z2", 5), { status: "reachable", min: 38 });
});

test("unknown outcome or target", () => {
  assert.equal(solve("elte-ttk-analizis1", A1_NO_Z2, "nincs", "z2", 4).status, "unreachable");
  assert.equal(solve("elte-ttk-analizis1", A1_NO_Z2, "gyak", "nincs", 4).status, "unreachable");
});
