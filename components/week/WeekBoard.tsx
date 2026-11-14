"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { format, isSameDay, startOfDay } from "date-fns";
import { ChevronRight } from "lucide-react";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { bucketSessionsByDay, bucketWeekByDay, urgencyOf } from "@/lib/radar";
import type { ClassSession, Deadline } from "@/lib/types";
import { ClassChip } from "@/components/week/ClassChip";
import { DeadlineChip } from "@/components/week/DeadlineChip";

export interface WeekBoardProps {
  weekStart: Date;
  deadlines: Deadline[];
  /** Timetable entries to show (classes above the deadlines of each day, holidays in the header). */
  sessions?: ClassSession[];
  now: Date;
  /** Pull every overdue item (any week) into an "Overdue" gutter left of Monday. */
  gutter?: boolean;
  showCourse?: boolean;
  label: string;
  /** Rendered in every empty day on narrow screens; wide screens leave the column blank. */
  emptyDay?: ReactNode;
  /** Narrow screens: drop every empty day, not only the past ones. */
  hideEmptyDays?: boolean;
  /** Shorter columns, for stacks of boards and secondary weeks. */
  dense?: boolean;
}

type BoardMotion = "next" | "prev" | undefined;

/**
 * Monday-to-Sunday board. Wide screens: one column per day. Narrow screens: one row per day,
 * with a disclosure for days that have already settled in the current week.
 */
export function WeekBoard({
  weekStart,
  deadlines,
  sessions = [],
  now,
  gutter = false,
  showCourse = true,
  label,
  emptyDay = "—",
  hideEmptyDays = false,
  dense = false,
}: WeekBoardProps) {
  const t = useT();
  const dl = dateLocale(useLocale());
  const historyId = useId();
  // The board re-keys on the week, replaying the slide in the matching direction.
  const week = weekStart.getTime();
  const [shown, setShown] = useState<{ week: number; motion: BoardMotion; historyOpen: boolean }>({
    week,
    motion: undefined,
    historyOpen: false,
  });
  if (shown.week !== week) {
    setShown({ week, motion: week > shown.week ? "next" : "prev", historyOpen: false });
  }

  const { overdue, days } = useMemo(() => {
    const isOverdue = (d: Deadline) => urgencyOf(d, now) === "overdue";
    const overdueItems = gutter
      ? deadlines
          .filter(isOverdue)
          .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
      : [];
    const placed = gutter ? deadlines.filter((d) => !isOverdue(d)) : deadlines;
    return { overdue: overdueItems, days: bucketWeekByDay(placed, weekStart) };
  }, [deadlines, now, gutter, weekStart]);

  const classDays = useMemo(() => bucketSessionsByDay(sessions, weekStart), [sessions, weekStart]);

  const showGutter = overdue.length > 0;
  const todayStart = startOfDay(now);
  const todayIndex = days.findIndex((day) => isSameDay(day.date, now));
  const hasContent = (i: number) =>
    days[i].items.length > 0 || classDays[i].sessions.length > 0 || !!classDays[i].holiday;

  const pastDays = todayIndex > 0 ? days.slice(0, todayIndex) : [];
  const historyLength = pastDays.every((day) => day.items.every((d) => d.done)) ? pastDays.length : 0;
  const hasHistory = days.slice(0, historyLength).some((_, i) => hasContent(i));
  const narrowEmpty = !showGutter && days.every((_, i) => i < historyLength || !hasContent(i));

  const daySections = days.map((day, i) => {
    const today = i === todayIndex;
    const past = day.date < todayStart;
    const empty = !hasContent(i);
    const { holiday, sessions: daySessions } = classDays[i];
    const hideNarrow = empty && (past || hideEmptyDays || narrowEmpty);
    return (
      <section
        key={day.date.toISOString()}
        aria-label={`${format(day.date, t.formats.weekdayMonthDay, { locale: dl })}${today ? t.week.todaySuffix : ""}`}
        aria-current={today ? "date" : undefined}
        className={`relative min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-slip)] px-3 pb-4 pt-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4 xl:flex xl:flex-col xl:gap-3 xl:px-2.5 ${
          dense ? "xl:min-h-[8rem]" : "xl:min-h-[15rem]"
        } ${hideNarrow ? "hidden" : "grid"} ${
          today ? "bg-canary-soft" : holiday ? "bg-sky" : past ? "bg-strip-past" : "bg-strip"
        }`}
      >
        {today && (
          <span aria-hidden="true" className="pin -top-[5px] left-[22px] xl:left-1/2 xl:-ml-[5.5px]" />
        )}
        <header className="flex min-w-0 flex-col xl:px-0.5">
          <span className={`font-display text-title capitalize [overflow-wrap:anywhere] ${past ? "text-muted" : "text-heading"}`}>
            {format(day.date, "EEEE", { locale: dl })}
          </span>
          <span className={`text-fine tabular-nums ${today ? "font-semibold text-heading" : "text-muted"}`}>
            {today ? t.week.todayAt(format(now, "HH:mm")) : format(day.date, t.formats.monthDay, { locale: dl })}
          </span>
          {holiday && (
            <span className="mt-0.5 text-fine font-semibold leading-snug text-accent-2 [overflow-wrap:anywhere]">
              {t.week.holiday(holiday.subject)}
            </span>
          )}
        </header>
        <div className="grid min-w-0 items-start gap-3 pt-1 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] xl:flex xl:flex-col xl:items-stretch">
          {daySessions.map((s) => (
            <ClassChip key={s.id} session={s} showCourse={showCourse} />
          ))}
          {day.items.map((d) => (
            <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} />
          ))}
          {empty && <span className="text-small text-muted-dim xl:hidden">{emptyDay}</span>}
        </div>
      </section>
    );
  });

  return (
    <div
      key={week}
      role="group"
      aria-label={label}
      data-board-motion={shown.motion}
      className={`flex flex-col gap-1 xl:grid xl:gap-2 ${
        showGutter
          ? "xl:grid-cols-[minmax(0,1.05fr)_repeat(7,minmax(0,1fr))]"
          : "xl:grid-cols-[repeat(7,minmax(0,1fr))]"
      }`}
    >
      {showGutter && (
        <section
          aria-label={t.week.overdueAria(overdue.length)}
          className="relative grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-slip)] bg-salmon px-3 pb-4 pt-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4 xl:flex xl:flex-col xl:gap-3 xl:px-2.5"
        >
          <header className="flex flex-col xl:px-0.5">
            <span className="font-display text-title text-danger">{t.week.overdue}</span>
            <span className="text-fine font-semibold tabular-nums text-danger">{overdue.length}</span>
          </header>
          <div className="grid min-w-0 items-start gap-3 pt-1 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] xl:flex xl:flex-col xl:items-stretch">
            {overdue.map((d) => (
              <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} showDate />
            ))}
          </div>
        </section>
      )}

      {hasHistory && (
        <button
          type="button"
          aria-expanded={shown.historyOpen}
          aria-controls={historyId}
          onClick={() => setShown({ ...shown, historyOpen: !shown.historyOpen })}
          className="group flex min-h-11 items-center gap-2 rounded-[var(--radius-slip)] px-3 text-left text-body font-semibold text-muted transition-colors hover:bg-strip hover:text-heading xl:hidden"
        >
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 motion-safe:transition-transform group-aria-expanded:rotate-90" />
          {t.week.earlier}
        </button>
      )}
      {historyLength > 0 && (
        <div id={historyId} className={shown.historyOpen ? "contents" : "hidden xl:contents"}>
          {daySections.slice(0, historyLength)}
        </div>
      )}
      {narrowEmpty && (
        <p className="rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-4 py-4 text-center text-body text-muted xl:hidden">{emptyDay}</p>
      )}
      {daySections.slice(historyLength)}
    </div>
  );
}
