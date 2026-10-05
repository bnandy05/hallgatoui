import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestVariant,
  confirmVariant,
  normalizeSemester,
  normalizeSubjectCode,
  normalizeUniversity,
  previousSemester,
  reportVariant,
  rulesHash,
  shareableRules,
} from "@/lib/rules/shared";
import { RULE_TEMPLATES } from "@/lib/rules/fixtures";
import { createMemoryKv } from "@/lib/server/kv";
import { confirmTemplate, findTemplate, forgetTemplateUser, reportTemplate, templateVoter, uniKey } from "@/lib/server/ruleTemplates";

const NOW = new Date("2026-10-05T12:00:00Z");
const A = RULE_TEMPLATES[0].rules;
const B = RULE_TEMPLATES[1].rules;

test("codes, universities and terms normalise", () => {
  assert.equal(normalizeSubjectCode(" ip-18 kvprjg "), "IP-18KVPRJG");
  assert.equal(normalizeSubjectCode("x"), null);
  assert.equal(normalizeUniversity("elte"), "elte");
  assert.equal(normalizeUniversity("Pázmány Péter"), "x-pazmany-peter");
  assert.equal(normalizeSemester("2026/27/1", NOW), "2026-27-1");
  assert.equal(normalizeSemester("2025/26/2", NOW), "2025-26-2");
  assert.equal(normalizeSemester(undefined, NOW), "2026-27-1");
  assert.equal(normalizeSemester("", new Date("2027-03-01T00:00:00Z")), "2026-27-2");
  assert.equal(normalizeSemester("", new Date("2027-01-10T00:00:00Z")), "2026-27-1");
  assert.equal(previousSemester("2026-27-1"), "2025-26-2");
  assert.equal(previousSemester("2026-27-2"), "2026-27-1");
});

test("the hash ignores notes and resolved flags", () => {
  const edited = { ...A, components: A.components.map((c, i) => (i === 0 ? { ...c, note: "x" } : c)), flags: A.flags.map((f) => ({ ...f, resolved: true })) };
  assert.equal(rulesHash(edited), rulesHash(A));
  assert.notEqual(rulesHash(B), rulesHash(A));
  assert.ok(shareableRules(edited).components.every((c) => c.note === undefined));
});

test("confirmations: one vote per user, the most-confirmed variant wins, reports count against", () => {
  let t = confirmVariant(null, A, "u1", NOW);
  t = confirmVariant(t, A, "u2", NOW);
  t = confirmVariant(t, B, "u3", NOW);
  assert.equal(bestVariant(t)!.id, rulesHash(A));
  assert.equal(bestVariant(t)!.confirmers.length, 2);
  t = confirmVariant(t, B, "u1", NOW); // u1 moves to B
  assert.deepEqual(t.variants.map((v) => v.confirmers.length), [1, 2]);
  assert.equal(bestVariant(t)!.id, rulesHash(B));
  t = reportVariant(t, rulesHash(B), "u4");
  t = reportVariant(t, rulesHash(B), "u5");
  assert.equal(bestVariant(t)!.id, rulesHash(A));
});

test("server: look up, fall back to last term, report, forget a deleted account", async () => {
  const kv = createMemoryKv();
  assert.equal(await findTemplate(kv, "alice", "elte", "IP-1", "2026-27-1"), null);
  assert.equal(await confirmTemplate(kv, "alice", "elte", "IP-1", "2025-26-2", A, NOW), null);
  const old = await findTemplate(kv, "bob", "elte", "IP-1", "2026-27-1");
  assert.equal(old?.previous, true);
  assert.equal(old?.confirmations, 1);
  assert.equal(old?.mine, false);
  assert.equal(await findTemplate(kv, "bob", "bme", "IP-1", "2026-27-1"), null, "another university never sees it");

  await confirmTemplate(kv, "bob", "elte", "IP-1", "2026-27-1", A, NOW);
  const cur = await findTemplate(kv, "bob", "elte", "IP-1", "2026-27-1");
  assert.equal(cur?.previous, false);
  assert.equal(cur?.mine, true);
  assert.equal(await confirmTemplate(kv, "bob", "elte", "IP-1", "2026-27-1", { nope: 1 }, NOW), "Érvénytelen szabályok");

  const raw = JSON.stringify(await kv.get("tpl:elte:IP-1:2026-27-1"));
  assert.ok(!raw.includes("bob"), "user ids are stored hashed");
  assert.ok(raw.includes(templateVoter("bob")));

  assert.equal(await reportTemplate(kv, "carol", "elte", "IP-1", "2026-27-1", cur!.variantId), true);
  await kv.set(uniKey("bob"), "elte");
  await forgetTemplateUser(kv, "bob");
  assert.equal(await kv.get("tpl:elte:IP-1:2026-27-1"), null, "a variant nobody backs is dropped");
  assert.equal(await kv.get(uniKey("bob")), null);
  assert.ok(await kv.get("tpl:elte:IP-1:2025-26-2"), "alice's template stays");
});
