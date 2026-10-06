import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractRules } from "@/lib/rules/extract";
import { compareRules } from "@/lib/rules/extract/equivalence";
import { consequence, mentions } from "@/lib/rules/extract/lexicon";
import { num, segment } from "@/lib/rules/extract/text";
import { RULE_TEMPLATES } from "@/lib/rules/fixtures";

const FIXTURES = ["dotnet", "progelm", "matek", "analizis"] as const;
const source = (name: string) => readFileSync(`fixtures/kovetelmeny/${name}/source.txt`, "utf8");
const answers = (name: string) => JSON.parse(readFileSync(`fixtures/kovetelmeny/${name}/answers.json`, "utf8"));

FIXTURES.forEach((name, i) => {
  test(`${name}: extraction is grade-equivalent to the hand-written template`, () => {
    const x = extractRules(source(name), answers(name));
    assert.equal(x.ok, true, x.errors.join("\n"));
    assert.deepEqual(x.open, []);
    assert.deepEqual(x.unrecognised, []);
    const mismatches = compareRules(RULE_TEMPLATES[i].rules, x.rules!, 400, i + 1);
    assert.equal(typeof mismatches, "object", String(mismatches));
    assert.deepEqual(
      (mismatches as Exclude<typeof mismatches, string>).map((m) => `${m.outcome}: ${m.expected} ≠ ${m.extracted}`),
      []
    );
  });
});

test("questions stay open until answered, and the preview is still valid", () => {
  const x = extractRules(source("dotnet"));
  assert.equal(x.ok, true);
  assert.deepEqual(x.open.sort(), ["mode:elmjav", "mode:gyjav", "onfail:zhk"]);
  const q = x.questions.find((q) => q.id === "onfail:zhk")!;
  assert.match(q.quote, /Minden zh-nak legalább elégségesnek/);
  assert.deepEqual(q.options.map((o) => o.id), ["fail", "none"]);
});

test("an answer changes the rules", () => {
  const none = extractRules(source("dotnet"), { ...answers("dotnet"), "onfail:zhk": "none" });
  const gate = none.rules!.outcomes[0].paths[0].gates!.find((g) => g.id === "zhk")!;
  assert.equal(gate.onFail, "none");
  const ifBetter = extractRules(source("analizis"), { "mode:pot": "ifBetter" });
  assert.equal(ifBetter.rules!.retakes[0].mode, "ifBetter");
});

test("an explicit consequence or mode is read from the text, not asked", () => {
  const x = extractRules(source("progelm"), {});
  const ids = x.questions.map((q) => q.id);
  assert.ok(!ids.some((id) => id.startsWith("mode:")), "the pótzh mode is stated (akkor is, ha rosszabb)");
  assert.ok(!ids.includes("onfail:pm"), "nincs gyakorlati jegy is stated");
  assert.equal(x.rules!.retakes[0].pick, "worse");
});

test("a stated total that doesn't add up hands the text to the guided reading, with the reason", () => {
  const x = extractRules(source("dotnet").replace("Összesen 31 pont", "Összesen 30 pont"), answers("dotnet"));
  assert.equal(x.mode, "guided");
  assert.equal(x.rules, null, "nothing is saved before the guided questions are answered");
  assert.ok(x.open.length > 0);
  assert.match(x.notes[0], /összesen 30 pont.*31/);
});

test("text that isn't a requirements document is rejected", () => {
  const x = extractRules("Kedves Hallgatók! A jövő heti óra elmarad. Üdvözlettel: az oktató");
  assert.equal(x.ok, false);
  assert.match(x.errors[0], /nem ismertünk fel/);
});

test("a formula naming something unknown hands the text to the guided reading", () => {
  const text = source("analizis").replace("Ö = F/2 + Z1 + Z2", "Ö = F/2 + Z1 + Z2 + Q");
  const x = extractRules(text, answers("analizis"));
  assert.equal(x.mode, "guided");
  assert.ok(x.notes.some((e) => /„q”/.test(e)), x.notes.join("\n"));
});

test("unrecognised sentences are listed for the student", () => {
  const x = extractRules(`${source("analizis")}\nA zh-k időpontját a Canvasban hirdetjük ki 3 héttel előre.`, answers("analizis"));
  assert.equal(x.ok, true);
  assert.deepEqual(x.unrecognised, ["A zh-k időpontját a Canvasban hirdetjük ki 3 héttel előre."]);
});

test("every rule part carries a quote from the text", () => {
  const x = extractRules(source("matek"), answers("matek"));
  const text = source("matek");
  assert.ok(x.sources.length >= 6);
  for (const s of x.sources) {
    for (const piece of s.quote.split(" · ")) assert.ok(text.includes(piece.split(": ").at(-1)!.trim().slice(0, 20)), piece);
  }
});

// ----- lexicon pieces -----

test("segment keeps ordinals and abbreviations inside a sentence", () => {
  const s = segment("A 2. zh legalább 20 pont. Max. 8 bónusz jár.\n0–11 pont: elégtelen (1)");
  assert.deepEqual(
    s.map((x) => x.text),
    ["A 2. zh legalább 20 pont.", "Max. 8 bónusz jár.", "0-11 pont: elégtelen (1)"]
  );
  assert.equal(s[0].fold, "a 2. zh legalabb 20 pont.");
});

test("Hungarian numerals", () => {
  assert.equal(num("ket"), 2);
  assert.equal(num("harom"), 3);
  assert.equal(num("12"), 12);
  assert.equal(num("4,5"), 4.5);
});

test("consequences: no grade vs fail", () => {
  assert.equal(consequence("ha valamelyik beadando nincs elfogadva, nincs gyakorlati jegy."), "none");
  assert.equal(consequence("kulonben a gyakorlati jegy elegtelen."), "fail");
  assert.equal(consequence("az alairas megtagadasra kerul"), "none");
  assert.equal(consequence("legalabb 20 pontnak kell lennie."), undefined);
});

test("nouns: a pótzh is not a zh, a gyakorlati zh is not a plain zh", () => {
  assert.deepEqual(
    mentions("a potzh a ket zh kozul a rosszabbat valtja ki").map((m) => m.key),
    ["zh"]
  );
  assert.deepEqual(
    mentions("a gyakorlati zh-k kozul egy, valamint az elmeleti zh egyszer javithato").map((m) => m.key),
    ["gyzh", "elmzh"]
  );
  assert.deepEqual(mentions("10 ropdolgozatot es 3 nagyzh-t irunk").map((m) => m.key), ["ropzh", "nagyzh"]);
});
