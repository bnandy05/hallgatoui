// Eval of the survey reading against real documents (the sandbox cannot reach TypeSafe; the owner can):
//
//   npm run jev:survey -- <doc.txt> "<course name>" [expected.json] [--dry]
//   node --import ./test/alias-loader.mjs scripts/jevSurvey.ts <doc.txt> "<course>" [expected.json] [--dry]
//
// Reads TYPESAFE_API_KEY or JEV_API_KEY, builds the request, calls System One once and prints,
// per question, the raw answer, the value read after the gates, the flag and (with an expected
// file `{ "<question id>": true | false | "<label>" | <number> | "none" }`) a ✓/✗ column.
// --dry prints the request and its size without calling. Not part of the app.

import { readFileSync } from "node:fs";
import { systemOne } from "@/lib/server/jev";
import {
  answerValue,
  buildSurveyRequest,
  FIELD_IDS,
  matchesExpected,
  readSurvey,
  scoreSurvey,
  type Expected,
  type FieldValue,
} from "@/lib/rules/extract/survey";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
const [docPath, courseArg, expectedPath] = args;
if (!docPath || !courseArg) {
  console.error('Usage: npm run jev:survey -- <doc.txt> "<course name>" [expected.json] [--dry]');
  process.exit(2);
}

const text = readFileSync(docPath, "utf8");
const { body, candidates, truncated } = buildSurveyRequest(text, { name: courseArg });
const expected: Expected | null = expectedPath ? (JSON.parse(readFileSync(expectedPath, "utf8")) as Expected) : null;

if (dry) {
  const json = JSON.stringify(body);
  console.log(JSON.stringify(body, null, 2));
  console.error(`\n${json.length} characters, ${candidates.length} number candidates${truncated ? ", document truncated" : ""}`);
  process.exit(0);
}

const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) {
  console.error("Set TYPESAFE_API_KEY (or JEV_API_KEY).");
  process.exit(2);
}

const answers = await systemOne(body, key);
if (!answers) {
  console.error("No answers (see the status above).");
  process.exit(1);
}
const draft = readSurvey(answers, candidates);

const show = (v: FieldValue): string =>
  v === null ? "none" : typeof v === "object" ? `${v.value}${v.percent ? "%" : ""}` : String(v);
const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

console.log(pad("question", 30), pad("raw answer", 34), pad("read", 22), pad("flag", 5), expected ? "exp." : "");
for (const id of FIELD_IDS) {
  const a = draft.raw[id];
  const raw = !a
    ? "(no answer)"
    : a.type === "noul"
      ? `noul ${a.noul.toFixed(2)}`
      : `${a.choice} ${a.confidence.toFixed(2)}${a.choice.startsWith("c") && a.choice !== "none" ? ` [${candidates.find((c) => c.id === a.choice)?.text ?? "?"}]` : ""}`;
  const f = draft.fields[id];
  const read = f.hidden ? "(gated out)" : show(f.value);
  let mark = "";
  if (expected && expected[id] !== undefined) {
    const e = expected[id]!;
    const rawOk = a ? matchesExpected(answerValue(id, a, candidates).value, e) : false;
    const afterOk = matchesExpected(f.hidden ? null : f.value, e);
    mark = `${afterOk ? "✓" : "✗"}${rawOk === afterOk ? "" : rawOk ? " (raw ✓)" : " (raw ✗)"}  ${show(e)}`;
  }
  console.log(pad(id, 30), pad(raw, 34), pad(read, 22), pad(f.flagged ? "FLAG" : "", 5), mark);
  if (f.flagged) console.log(`${" ".repeat(32)}${f.reasons.join(" ")}`);
}
if (truncated) console.log("\nThe document was longer than the limit and was cut.");
if (expected) {
  const s = scoreSurvey(draft, expected, candidates);
  console.log(`\nraw ${s.raw}/${s.total}, after rules ${s.after}/${s.total}, wrong and not flagged ${s.wrongUnflagged}`);
}
