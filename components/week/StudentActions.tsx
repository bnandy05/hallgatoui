"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { useStore } from "@/lib/store";
import { shortDayLabel } from "@/lib/rules/instances";
import { studentActions } from "@/lib/rules/studentActions";
import { openCatchUp } from "@/lib/catchupEvents";
import type { ClassSession, Deadline } from "@/lib/types";
import { Button } from "@/components/ui/Button";

export function StudentActions({ now, sessions, deadlines }: { now: Date; sessions: ClassSession[]; deadlines: Deadline[] }) {
  const t = useT().trackerPlanning;
  const locale = useLocale();
  const courses = useStore((s) => s.courses);
  const rules = useStore((s) => s.requirementRules);
  const results = useStore((s) => s.requirementResults);
  const semester = useStore((s) => s.semester);
  const attendancePrefs = useStore((s) => s.attendancePrefs);
  const [expanded, setExpanded] = useState(false);
  const actions = useMemo(() => studentActions({ now, courses, rules, results, sessions, deadlines, semester, attendancePrefs }, locale),
    [now, courses, rules, results, sessions, deadlines, semester, attendancePrefs, locale]);
  if (!actions.length) return null;

  return <section className="sheet-paper px-4 py-4 sm:px-6" aria-labelledby="student-actions">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id="student-actions" className="font-display text-subhead text-heading">{t.actions}</h2>
      <p className="text-small text-muted">{t.actionsHint}</p>
    </div>
    <ul className="mt-3 divide-y divide-border">
      {(expanded ? actions : actions.slice(0, 4)).map((action) => {
        const course = courses.find((c) => c.id === action.courseId);
        const body = <>
          <span className="min-w-0">
            <span className={`block break-words font-semibold ${action.priority === 0 ? "text-danger" : "text-heading"}`}>{action.label}</span>
            <span className="mt-0.5 block text-small text-muted">
              {[course?.name, action.date && shortDayLabel(new Date(action.date), locale)].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </>;
        const classes = "flex w-full items-center justify-between gap-3 rounded-[var(--radius)] py-2.5 text-left text-body hover:underline";
        return <li key={action.key}>
          {action.groupKey ? <button type="button" className={classes} onClick={() => openCatchUp({ groupKey: action.groupKey })}>{body}</button>
            : <Link href={`/targy/${action.courseId}#${action.section}`} className={classes}>{body}</Link>}
        </li>;
      })}
    </ul>
    {actions.length > 4 && <Button size="sm" variant="secondary" aria-expanded={expanded} className="mt-2" onClick={() => setExpanded(!expanded)}>
      {expanded ? t.fewerActions : t.moreActions}
    </Button>}
  </section>;
}
