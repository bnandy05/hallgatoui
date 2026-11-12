"use client";

import { useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { solveFor } from "@/lib/rules/solve";
import type { RequirementResult, Scale, SubjectRules } from "@/lib/rules/types";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { Select } from "@/components/ui/Select";
import { formatNumber } from "./ResultInputs";

type Unit = "grade" | "points" | "plusMinus" | "percent";

function scaleUnit(scale: Scale | undefined): Unit {
  return scale?.kind === "grade" ? "grade" : "points";
}

export function RulesSolver({
  rules,
  results,
  labelOf,
}: {
  rules: SubjectRules;
  results: RequirementResult[];
  labelOf: (id: string) => string;
}) {
  const tAll = useT();
  const t = tAll.rulesPanel;
  const locale = useLocale();
  const seriesUnit: Record<Unit, string> = { points: t.unitPoints, plusMinus: t.unitPlusMinus, percent: t.unitPercent, grade: "" };
  // Only what is still ahead: an exam or retake without a result, a series with items left.
  const targets = useMemo(() => {
    const recorded = (id: string) => results.filter((r) => r.componentId === id && r.state !== "pending").length;
    const list: { id: string; kind: "exam" | "retake" | "series"; unit: Unit }[] = [];
    for (const c of rules.components) {
      if (c.kind === "exam" && recorded(c.id) === 0) list.push({ id: c.id, kind: "exam", unit: scaleUnit(c.scale) });
      if (c.kind === "series" && recorded(c.id) < c.count) list.push({ id: c.id, kind: "series", unit: c.scoring.kind });
    }
    for (const r of rules.retakes) {
      const first = rules.components.find((c) => c.id === r.targets[0]);
      if (recorded(r.id) === 0) {
        list.push({ id: r.id, kind: "retake", unit: scaleUnit(first?.kind === "exam" ? first.scale : undefined) });
      }
    }
    return list;
  }, [rules, results]);

  const [outcomeId, setOutcomeId] = useState(rules.outcomes[0]?.id ?? "");
  const [goal, setGoal] = useState(2);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [others, setOthers] = useState<"worst" | "best">("worst");

  const effectiveOutcome = rules.outcomes.some((o) => o.id === outcomeId) ? outcomeId : (rules.outcomes[0]?.id ?? "");
  const effectiveTarget = targets.some((x) => x.id === target) ? target : (targets[0]?.id ?? "");
  const answer = useMemo(() => {
    if (!effectiveOutcome || !effectiveTarget) return null;
    return solveFor(rules, results, new Date(), { outcomeId: effectiveOutcome, goal, target: effectiveTarget, others }, locale);
  }, [rules, results, effectiveOutcome, goal, effectiveTarget, others, locale]);

  if (targets.length === 0 || rules.outcomes.length === 0) return null;
  const targetInfo = targets.find((x) => x.id === effectiveTarget);
  const outcomeLabel = rules.outcomes.find((o) => o.id === effectiveOutcome)?.label ?? "";

  // The answer as a figure ("12 pont", "4-es") inside its sentence.
  let figure: string | null = null;
  let before = "";
  let after = "";
  if (answer && targetInfo) {
    if (answer.status === "already") before = t.alreadyThere(outcomeLabel, goal);
    else if (answer.status === "unreachable") before = answer.reason ?? t.unreachable(goal);
    else if (answer.status === "indeterminate") before = answer.reason ?? tAll.rules.solve.searchLimit;
    else if (answer.min !== undefined) {
      const retakeLabel = (id: string, targetId?: string) => targetId
        ? t.retakeFor(labelOf(id), labelOf(targetId))
        : labelOf(id);
      const retakes = answer.viaRetakes?.map(({ id, targetId }) => retakeLabel(id, targetId));
      const via = retakes?.length ? t.via(new Intl.ListFormat(locale).format(retakes)) : "";
      const series = targetInfo.kind === "series";
      before = t.need(retakeLabel(effectiveTarget, answer.retakeTarget), series);
      figure = series
        ? `${formatNumber(answer.min, locale)} ${seriesUnit[targetInfo.unit]}`
        : targetInfo.unit === "grade"
          ? t.figureGrade(answer.min)
          : t.figurePoints(formatNumber(answer.min, locale));
      after = t.needAfter(series, via);
    }
  }
  const tone = answer?.status === "unreachable" ? "bg-salmon" : answer?.status === "already" ? "bg-sky" : "bg-inset";

  return (
    <section className="sheet-paper flex flex-col gap-3 px-5 py-4 sm:px-6" aria-labelledby="solver-title">
      <h3 id="solver-title" className="font-display text-subhead text-heading">
        {t.solverTitle}
      </h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <Label htmlFor="solve-outcome">{t.solverGrade}</Label>
          <Select id="solve-outcome" value={effectiveOutcome} onChange={(e) => setOutcomeId(e.target.value)}>
            {rules.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="solve-goal">{t.solverGoal}</Label>
          <Select id="solve-goal" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {[2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {t.atLeast(g)}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
          <Label htmlFor="solve-target">{t.solverFrom}</Label>
          <Select id="solve-target" value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((x) => (
              <option key={x.id} value={x.id}>
                {labelOf(x.id)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.othersLabel}>
        <Pill active={others === "worst"} onClick={() => setOthers("worst")}>
          {t.othersWorst}
        </Pill>
        <Pill active={others === "best"} onClick={() => setOthers("best")}>
          {t.othersBest}
        </Pill>
      </div>
      {before && (
        <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--radius-slip)] px-4 py-3 text-body text-heading ${tone}`} aria-live="polite">
          <span>{before}</span>
          {figure && <span className="font-display text-headline leading-none tabular-nums">{figure}</span>}
          {after && <span>{after}</span>}
        </p>
      )}
    </section>
  );
}
