# Követelményrendszer fixtures

Test inputs for the rule extraction (`lib/rules/extract/*`, `test/rulesExtract.test.ts`).

Each folder holds:

- `source.txt`: the requirements as a student would paste them from the PDF.
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
