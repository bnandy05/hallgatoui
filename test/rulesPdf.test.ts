import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractRules } from "@/lib/rules/extract";
import { compareRules } from "@/lib/rules/extract/equivalence";
import { documentText, pageText, type PdfTextItem } from "@/lib/rules/extract/pdf";
import { unwrapLines } from "@/lib/rules/extract/text";
import { RULE_TEMPLATES } from "@/lib/rules/fixtures";

const FIXTURES = ["dotnet", "progelm", "matek", "analizis"] as const;
const answers = (name: string) => JSON.parse(readFileSync(`fixtures/kovetelmeny/${name}/answers.json`, "utf8"));

async function pdfText(path: string): Promise<string> {
  const task = getDocument({ data: new Uint8Array(readFileSync(path)) });
  const doc = await task.promise;
  const pages: PdfTextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.flatMap((it) => ("str" in it ? [it] : [])));
  }
  await task.destroy();
  return documentText(pages);
}

// source.pdf is source.txt printed on a narrow page (Chromium), so most sentences wrap.
FIXTURES.forEach((name, i) => {
  test(`${name}: the PDF reads the same as the pasted text`, async () => {
    const x = extractRules(await pdfText(`fixtures/kovetelmeny/${name}/source.pdf`), answers(name));
    assert.equal(x.ok, true, x.errors.join("\n"));
    assert.deepEqual(x.open, []);
    const mismatches = compareRules(RULE_TEMPLATES[i].rules, x.rules!, 200, i + 1);
    assert.equal(typeof mismatches, "object", String(mismatches));
    assert.deepEqual(mismatches, []);
  });
});

const item = (str: string, x: number, y: number, width: number, hasEOL = false): PdfTextItem => ({
  str,
  hasEOL,
  transform: [10, 0, 0, 10, x, y],
  width,
  height: 10,
});

test("glyph runs on one baseline join with a space only where there is a gap", () => {
  assert.equal(pageText([item("Beadandó", 0, 100, 40), item("k", 40, 100, 5), item("3 pont", 50, 100, 30)]), "Beadandók 3 pont");
});

test("a new baseline or an end-of-line mark starts a new line", () => {
  assert.equal(pageText([item("Első sor", 0, 100, 40, true), item("Második", 0, 88, 40), item("Harmadik", 0, 76, 40)]), "Első sor\nMásodik\nHarmadik");
});

test("wrapped sentences are rejoined, headings, list items and table rows are not", () => {
  assert.equal(
    unwrapLines("Gyakorlati jegy\nA határidő után egy hetes javítási időszak van, az ekkor\nelfogadott beadandó 1 pontot ér.\na) első pont\n0–11 pont: elégtelen (1)"),
    "Gyakorlati jegy\nA határidő után egy hetes javítási időszak van, az ekkor elfogadott beadandó 1 pontot ér.\na) első pont\n0–11 pont: elégtelen (1)"
  );
  assert.equal(unwrapLines("ezeket 1–5 skálán értékeljük,\nMindkettő duplán számít."), "ezeket 1–5 skálán értékeljük, Mindkettő duplán számít.");
});
