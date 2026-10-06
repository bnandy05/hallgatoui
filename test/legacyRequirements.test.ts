import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppData } from "@/lib/importData";
import { withoutRequirementData } from "@/lib/legacyRequirements";
import { emptyAppData, makeCourse } from "./helpers";

function legacyDoc() {
  const course = {
    ...makeCourse("c", "Analízis"),
    requirements: "Két zh, mindkettő legalább 40%.",
    resources: [
      { id: "r1", title: "Követelmények.pdf", url: "https://example.com/k.pdf", kind: "kovetelmeny", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "r2", title: "Jegyzet", url: "https://example.com/j.pdf", kind: "jegyzet", createdAt: "2026-09-01T00:00:00.000Z" },
    ],
  };
  return {
    ...emptyAppData(),
    courses: [course, makeCourse("d", "Algebra")],
    requirementRules: [{ id: "rules:c", courseId: "c" }],
    requirementResults: [{ id: "c|zh1|n:1", value: 30 }],
    semester: { start: "2026-09-07" },
    catchUp: { promptedUntil: "2026-10-01T00:00:00.000Z" },
  };
}

test("the dropped requirements tracker's data is stripped on save and import", () => {
  const data = parseAppData(legacyDoc()) as unknown as Record<string, unknown>;
  for (const key of ["requirementRules", "requirementResults", "semester", "catchUp"]) assert.equal(key in data, false);
  const [c, d] = (data.courses as { resources: { id: string }[]; requirements?: string }[]);
  assert.equal("requirements" in c, false);
  assert.deepEqual(c.resources.map((r) => r.id), ["r2"]);
  assert.equal(d.resources.length, 0);
});

test("leftovers are stripped from what the server sends back", () => {
  const out = withoutRequirementData(legacyDoc() as never) as unknown as Record<string, unknown>;
  assert.equal("requirementRules" in out, false);
  assert.equal("semester" in out, false);
  const [c] = out.courses as { resources: { kind: string }[] }[];
  assert.deepEqual(c.resources.map((r) => r.kind), ["jegyzet"]);
});
