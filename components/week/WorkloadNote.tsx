"use client";

import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { formatEstimate, type weekWorkload } from "@/lib/radar";

/** "~9 h estimated work" for a week; on canary paper (never red) when the week is heavy. Renders nothing without estimates. */
export function WorkloadNote({ workload }: { workload: ReturnType<typeof weekWorkload> }) {
  const t = useT();
  const locale = useLocale();
  if (workload.estimated === 0) return null;
  const text = t.estimate.workload(formatEstimate(workload.minutes, locale));
  const title = [workload.heavy ? t.estimate.heavyWeek : null, workload.unestimated > 0 ? t.estimate.unestimated(workload.unestimated) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={title || undefined}
      className={`inline-flex items-center tabular-nums ${
        workload.heavy
          ? "rounded-[var(--radius-badge)] bg-canary px-2 py-0.5 font-semibold text-heading"
          : "text-muted"
      }`}
    >
      {text}
    </span>
  );
}
