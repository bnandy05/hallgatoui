# Követelményrendszer fixtures

Test inputs for the rule extraction (`lib/rules/extract/*`, `test/rulesExtract.test.ts`).

Each folder holds:

- `source.txt`: the requirements as a student would paste them from the PDF.
- `source.pdf`: the same text printed by Chromium on a narrow A5 page, so most sentences wrap;
  `test/rulesPdf.test.ts` reads it with pdf.js and checks it gives the same rules.
- `answers.json`: the answers to the extraction's questions (what Jev or the student would pick),
  chosen to match the assumptions of the hand-written template.

The expected rules are the hand-written templates in `lib/rules/fixtures.ts` (same order:
dotnet, progelm, matek, analizis). The test extracts each source, maps the component ids and
checks **grade equivalence**: random result sets evaluated by the engine must give the same
grades, bounds and statuses on both rule sets.

**Provenance.** The four original PDFs never reached the project. These texts were rewritten from
the summaries in the project brief (issue #33), in the wording ELTE documents typically use.
Replace them with the real texts (scrubbed: no teacher names, emails or phone numbers) when the
PDFs arrive, and grow the lexicon until the test passes again. Every new pattern needs a sentence
here and a test.

**survey.json** (the survey reading, `lib/rules/extract/survey`): the correct answer to each of the
24 questions, in the owner's expected-file format `{ "<question id>": true | false | "<label>" |
<number> | "none" }`. The numbers are what the document literally says, so a figure the text leaves
out (matek: the lowest limit for grade 2, analizis: the röpdolgozat total) is `"none"` and the
student fills it in the form. Used by `test/rulesSurvey.test.ts` and as the input of
`npm run jev:survey -- <source.txt> "<course>" <survey.json>`.
