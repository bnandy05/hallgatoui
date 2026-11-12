"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import type { GradeValue, OutcomeEval } from "@/lib/rules/engine";
import { Badge } from "@/components/ui/Badge";
import { GateIcon } from "./GateIcon";

const STATUS_COLOR: Record<OutcomeEval["status"], string> = {
  final: "var(--success)",
  provisional: "var(--accent)",
  open: "var(--muted)",
};

/** Every grade on one sheet, side by side when there is room. */
export function RulesStanding({ outcomes }: { outcomes: OutcomeEval[] }) {
  const t = useT().rulesPanel;
  if (outcomes.length === 0) return null;
  return (
    <section aria-label={t.standing} className="sheet-paper overflow-hidden">
      <div className={`grid ${outcomes.length > 1 ? "@2xl:grid-cols-2" : ""}`}>
        {outcomes.map((o) => (
          <OutcomeStanding key={o.outcomeId} outcome={o} wide={outcomes.length === 1} />
        ))}
      </div>
    </section>
  );
}

function OutcomeStanding({ outcome, wide }: { outcome: OutcomeEval; wide: boolean }) {
  const tAll = useT();
  const t = tAll.rulesPanel;
  const gateText = tAll.rulesBreakdown.gate;
  const gradeWord = (g: number | null) => (g === null || g === 0 ? t.noGrade : String(g));
  const statusText = { final: t.outcomeFinal, provisional: t.outcomeProvisional, open: t.outcomeOpen }[outcome.status];
  const { status, current, best, worst } = outcome;
  const lo = Math.min(worst, best);
  const hi = Math.max(worst, best);
  const grades: GradeValue[] = [...(lo === 0 || current === 0 ? [0 as const] : []), 1, 2, 3, 4, 5];
  const unmet = outcome.gates.filter((g) => g.status !== "met");
  const gates = [...unmet, ...outcome.gates.filter((g) => g.status === "met")];

  const summary =
    status === "final"
      ? t.summaryFinal(gradeWord(current))
      : status === "provisional"
        ? lo === hi
          ? t.summarySame(gradeWord(current))
          : t.summaryBest(gradeWord(current), gradeWord(hi))
        : lo === hi
          ? t.summaryOpenSame(gradeWord(hi))
          : t.summaryOpenRange(gradeWord(lo), hi);

  return (
    <div
      className={`flex flex-col gap-3 border-t border-border px-5 py-4 first:border-t-0 sm:px-6 @2xl:border-t-0 @2xl:border-l @2xl:first:border-l-0 ${
        wide ? "@2xl:flex-row @2xl:items-start @2xl:gap-10" : ""
      }`}
    >
      <div className={`flex min-w-0 flex-col gap-2.5 ${wide ? "@2xl:w-[22rem] @2xl:shrink-0" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-lead font-bold text-heading">{outcome.label}</h4>
          <Badge color={STATUS_COLOR[status]}>{statusText}</Badge>
        </div>
        <ol className="grid grid-flow-col auto-cols-fr gap-1" aria-hidden>
          {grades.map((g) => {
            const isCurrent = current !== null && g === current;
            const reach = g >= lo && g <= hi;
            const failing = g <= 1;
            const cls = isCurrent
              ? status === "final"
                ? failing
                  ? "border-danger bg-danger text-accent-ink"
                  : "border-accent bg-accent text-accent-ink"
                : `border-2 ${failing ? "border-danger text-danger" : "border-accent text-heading"} bg-card`
              : reach
                ? "border-border-strong bg-card text-heading"
                : "border-transparent bg-inset text-muted-dim";
            return (
              <li key={g} className={`flex h-11 items-center justify-center rounded-[var(--radius-slip)] border ${cls}`}>
                <span className={`font-display tabular-nums leading-none ${g === 0 ? "text-small font-semibold tracking-normal" : "text-headline"}`}>
                  {g === 0 ? t.gradeNone : g}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-small leading-snug text-muted">{summary}</p>
      </div>
      {(gates.length > 0 || outcome.applied.length > 0) && (
        <div className="min-w-0 flex-1">
          {gates.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {gates.map((g) => (
                <li key={`${g.pathId ?? ""}-${g.id}`} className="flex items-start gap-2 text-small leading-snug">
                  <GateIcon status={g.status} />
                  <span className={g.status === "failed" || g.status === "fixable" ? "text-danger" : g.status === "met" ? "text-muted" : "text-foreground"}>
                    {g.label}
                    <span className="sr-only">: {gateText[g.status]}</span>
                    {g.status === "fixable" && <span className="text-fine">{t.fixable}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outcome.applied.length > 0 && (
            <p className="mt-1.5 text-fine text-muted">{t.applied(outcome.applied.join(", "))}</p>
          )}
        </div>
      )}
    </div>
  );
}
