import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { describeRules, formulaDescriber } from "@/lib/rules/describe";
import { evaluate } from "@/lib/rules/engine";
import type { RequirementResult, SubjectRules } from "@/lib/rules/types";
import { StandingComparison } from "./StandingComparison";

export function RulesChangePreview({ current, proposed, results, kept, sourceText, evidence = [], today }: {
  current: SubjectRules;
  proposed: SubjectRules;
  results: RequirementResult[];
  kept: RequirementResult[];
  sourceText?: string;
  evidence?: string[];
  today: Date;
}) {
  const t = useT().trackerPlanning;
  const locale = useLocale();
  const lines = (rules: SubjectRules) => {
    const describe = formulaDescriber(rules, locale);
    return [
      ...describeRules(rules, locale).flatMap((section) => section.lines.map((line) => ({ title: section.title, line }))),
      ...rules.outcomes.flatMap((outcome) => [...(outcome.gates ?? []), ...outcome.paths.flatMap((path) => path.gates ?? [])]
        .map((gate) => ({ title: outcome.label, line: `${gate.label} · ${describe(gate.test)}` }))),
      ...(rules.examEligibility ?? []).map((g) => ({ title: t.eligibility, line: `${g.label} · ${describe(g.test)}` })),
    ];
  };
  const oldLines = lines(current);
  const newLines = lines(proposed);
  const byKey = (list: typeof oldLines) => new Set(list.map((item) => JSON.stringify(item)));
  const oldKeys = byKey(oldLines);
  const newKeys = byKey(newLines);
  const before = oldLines.filter((item) => !newKeys.has(JSON.stringify(item)));
  const after = newLines.filter((item) => !oldKeys.has(JSON.stringify(item)));
  const changed = before.length > 0 || after.length > 0;
  const normalize = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const terms = new Set(after.flatMap(({ line }) => normalize(line).match(/[a-z]{5,}|\b\d+\b/g) ?? []));
  const attendanceChanged = proposed.components.some((next) => next.kind === "attendance" && next.limit && !current.components.some(
    (old) => old.id === next.id && old.kind === "attendance" && JSON.stringify(old.limit) === JSON.stringify(next.limit)));
  const candidates = [...new Set([...evidence, ...(sourceText?.split(/\n+/) ?? [])].map((line) => line.trim()))];
  const excerpts = changed ? candidates.map((line, index) => ({
    line, index,
    score: [...new Set(normalize(line).match(/[a-z]{5,}|\b\d+\b/g) ?? [])].filter((word) => terms.has(word)).length
      + (attendanceChanged && /hiányz|jelenlét|absenc|attendan/i.test(line) && /\d/.test(line) ? 5 : 0)
      + (evidence.includes(line) ? 1 : 0),
  })).filter((row) => row.score >= 2 && row.line.length >= 12).sort((a, b) => b.score - a.score).slice(0, 3) : [];
  return <section className="flex flex-col gap-4 rounded-[var(--radius-slip)] bg-inset p-4" aria-labelledby="rules-change-preview">
    <h3 id="rules-change-preview" className="font-display text-subhead text-heading">{t.preview}</h3>
    {changed ? <div className="grid gap-4 sm:grid-cols-2">
      {([{ title: t.savedRules, empty: t.added, items: before }, { title: t.proposedRules, empty: t.removed, items: after }]).map((column) => (
        <div key={column.title}>
          <h4 className="text-body font-semibold text-heading">{column.title}</h4>
          {column.items.length ? <ul className="mt-2 space-y-2 text-small">{column.items.map((item, i) => (
            <li key={i} className="break-words"><span className="font-semibold">{item.title}</span><br />{item.line}</li>
          ))}</ul> : <p className="mt-2 text-small text-muted">{column.empty}</p>}
        </div>
      ))}
    </div> : <p className="text-small text-muted">{t.noChanges}</p>}
    {excerpts.length > 0 && <div><h4 className="text-body font-semibold">{t.sourceExcerpts}</h4>
      {excerpts.map(({ line, index }) => <blockquote key={index} className="mt-2 border-s border-border-strong ps-3 text-small text-muted">{line.slice(0, 500)}</blockquote>)}
    </div>}
    {sourceText && <details><summary className="cursor-pointer text-small font-semibold">{t.sourceText}</summary>
      <p className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-card p-3 text-small">{sourceText}</p>
    </details>}
    <div><h4 className="text-body font-semibold text-heading">{t.standingImpact}</h4>
      <StandingComparison before={evaluate(current, results, today, locale)} after={evaluate(proposed, kept, today, locale)} />
      <p className="mt-2 text-small text-muted">{t.recordedKept(kept.length)}. {t.previousRetained}</p>
    </div>
  </section>;
}
