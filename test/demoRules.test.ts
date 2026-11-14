// The demo's requirement tracker data: valid rules in both languages, with the results counting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoRequirements, DEMO_RULES_COURSE_ID } from "@/lib/demoRules";
import { buildShowcaseData } from "@/lib/demo";
import { evaluate } from "@/lib/rules/engine";
import { validateRules } from "@/lib/rules/validate";
import type { SubjectRules } from "@/lib/rules/types";

const NOW = new Date("2026-10-21T10:00:00Z");

/** Every `label` and flag `message` in a rule set. */
function texts(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => texts(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "label" || k === "message") && typeof v === "string") out.push(v);
      else texts(v, out);
    }
  }
  return out;
}

for (const locale of ["hu", "en"] as const) {
  test(`demo requirements (${locale}): valid rules, results count`, () => {
    const { rules, results } = buildDemoRequirements(NOW, locale);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].courseId, DEMO_RULES_COURSE_ID);
    const { id, courseId, source, templateId, updatedAt, ...subject } = rules[0];
    void id; void courseId; void source; void templateId; void updatedAt;
    const checked = validateRules(subject, locale);
    assert.ok(checked.ok, checked.ok ? "" : checked.errors.join("; "));
    const ev = evaluate(subject as SubjectRules, results, NOW, locale);
    const z1 = ev.components.find((c) => c.id === "z1");
    assert.equal(z1?.points, 32);
    assert.ok(results.every((r) => r.courseId === DEMO_RULES_COURSE_ID && r.id.startsWith(`${DEMO_RULES_COURSE_ID}|`)));
  });
}

test("the English demo rules carry no Hungarian text", () => {
  const { rules } = buildDemoRequirements(NOW, "en");
  const hungarian = texts(rules[0]).filter((t) => /[áéíóöőúüű]/i.test(t));
  assert.deepEqual(hungarian, []);
});

test("the showcase data has the tracker on a demo course in both languages", () => {
  for (const locale of ["hu", "en"] as const) {
    const data = buildShowcaseData(NOW, locale);
    assert.equal(data.requirementRules?.[0]?.courseId, DEMO_RULES_COURSE_ID);
    assert.ok(data.courses.some((c) => c.id === DEMO_RULES_COURSE_ID));
    assert.ok((data.requirementResults?.length ?? 0) >= 3);
  }
});
