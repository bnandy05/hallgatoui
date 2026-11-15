import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankedVariants,
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
import { confirmTemplate, findTemplates, forgetTemplateUser, reportTemplate, templateVoter, uniKey, recordTemplateUse } from "@/lib/server/ruleTemplates";

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
  assert.equal(rankedVariants(t, "reader")[0]!.id, rulesHash(A));
  assert.equal(rankedVariants(t, "reader")[0]!.confirmers.length, 2);
  t = confirmVariant(t, B, "u1", NOW); // u1 moves to B
  assert.equal(t.variants.find((v) => v.id === rulesHash(A))!.confirmers.length, 1);
  assert.equal(rankedVariants(t, "reader")[0]!.id, rulesHash(B));
  t = reportVariant(t, rulesHash(B), "u4");
  t = reportVariant(t, rulesHash(B), "u5");
  assert.equal(rankedVariants(t, "reader")[0]!.id, rulesHash(A));
});

test("server: ranked options, historical fallback, scoped reporting, and account deletion", async () => {
  const kv = createMemoryKv();
  const term = "2026-27-1";
  const oldTerm = "2022-23-1";
  const find = (user: string, uni = "elte", semester = term) => findTemplates(kv, user, uni, ["IP-1"], semester, term);
  assert.deepEqual(await find("alice"), []);
  assert.equal(await confirmTemplate(kv, "alice", "elte", "IP-1", oldTerm, A, NOW), null);
  assert.deepEqual(await find("alice"), [], "a user's sole submission is not offered back to them");
  const [old] = await find("bob");
  assert.equal(old.previous, true);
  assert.equal(old.semester, oldTerm);
  assert.equal(old.confirmations, 1);
  assert.deepEqual(await find("bob", "bme"), [], "another university never sees it");

  assert.equal(await recordTemplateUse(kv, "bob", "elte", "IP-1", oldTerm, old.variantId, NOW), true);
  assert.equal(await recordTemplateUse(kv, "bob", "elte", "IP-1", oldTerm, old.variantId, NOW), true);
  assert.equal((await find("carol"))[0].confirmations, 2, "repeated imports count once");
  assert.equal(await kv.get("tpl:elte:IP-1:2026-27-1"), null, "an import cannot republish an old variant in a new term");
  assert.equal((await find("carol", "elte", oldTerm))[0].previous, true, "even an archived course carries the past term warning");

  await Promise.all([
    confirmTemplate(kv, "alice", "elte", "IP-1", term, A, NOW),
    confirmTemplate(kv, "bob", "elte", "IP-1", term, A, NOW),
    confirmTemplate(kv, "carol", "elte", "IP-1", term, B, NOW),
    confirmTemplate(kv, "dave", "elte", "IP-1", term, A, NOW),
  ]);
  const current = await find("reader");
  assert.deepEqual(current.map((v) => [v.variantId, v.confirmations, v.previous]), [
    [rulesHash(A), 3, false], [rulesHash(B), 1, false],
  ]);
  assert.equal(await confirmTemplate(kv, "bob", "elte", "IP-1", term, { nope: 1 }, NOW), "bad_rules");

  const raw = JSON.stringify(await kv.get("tpl:elte:IP-1:2026-27-1"));
  assert.ok(!raw.includes("bob"), "user ids are stored hashed");
  assert.ok(raw.includes(templateVoter("bob")));

  assert.equal(await reportTemplate(kv, "reader", "elte", "IP-1", term, current[0].variantId), true);
  assert.equal(await reportTemplate(kv, "reader", "elte", "IP-1", term, current[0].variantId), true);
  assert.deepEqual((await find("reader")).map((v) => v.variantId), [rulesHash(B)]);
  assert.equal((await find("another"))[0].variantId, rulesHash(A), "the popularity of a supported version survives one report");

  await kv.set(uniKey("bob"), "elte");
  await forgetTemplateUser(kv, "bob");
  assert.equal((await find("alice"))[0].confirmations, 2);
  assert.equal(await kv.get(uniKey("bob")), null);
  assert.ok(await kv.get("tpl:elte:IP-1:2022-23-1"), "alice's historical rules stay");
  await forgetTemplateUser(kv, "carol");
  assert.equal((await find("another")).length, 1, "a variant nobody backs is dropped");
});
