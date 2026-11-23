import { useT } from "@/lib/i18n/I18nProvider";
import type { Evaluation, OutcomeEval } from "@/lib/rules/engine";

export function StandingComparison({ before, after, scenario = false }: { before: Evaluation; after: Evaluation; scenario?: boolean }) {
  const { trackerPlanning: t, rulesPanel } = useT();
  const label = (outcome?: OutcomeEval) => {
    if (!outcome) return t.notCalculated;
    const grade = (n: number) => n === 0 ? rulesPanel.noGrade : String(n);
    return t.gradeRange(grade(outcome.worst), grade(outcome.best));
  };
  const ids = [...new Set([...before.outcomes, ...after.outcomes].map((o) => o.outcomeId))];
  if (!ids.length && !before.examEligibility && !after.examEligibility) return null;
  const row = (id: string, title: string, current: string, proposed: string) => <tr key={id} className="border-t border-border">
    <th scope="row" className="py-2 pr-2 font-semibold text-heading">{title}</th>
    <td className="px-2 py-2 text-muted tabular-nums">{current}</td>
    <td className="py-2 pl-2 font-semibold text-heading tabular-nums">{proposed}</td>
  </tr>;
  const eligibility = (e: Evaluation) => e.examEligibility ? t[e.examEligibility.status] : t.notConfigured;
  return <table className="w-full table-fixed text-left text-small">
    <thead><tr><td className="w-[42%]" /><th scope="col" className="px-2 py-1">{t.before}</th><th scope="col" className="py-1 pl-2">{t.after}</th></tr></thead>
    <tbody>
      {ids.map((id) => {
        const a = before.outcomes.find((o) => o.outcomeId === id);
        const b = after.outcomes.find((o) => o.outcomeId === id);
        return row(id, b?.label ?? a!.label, label(a), label(b));
      })}
      {(before.examEligibility || after.examEligibility) && row("eligibility", t.eligibility, eligibility(before), scenario && after.examEligibility?.status === "eligible" ? t.scenarioEligible : eligibility(after))}
    </tbody>
  </table>;
}
