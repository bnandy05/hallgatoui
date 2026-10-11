"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { format, isSameDay, startOfDay } from "date-fns";
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
  /** Rule the columns in on first mount (the page's lead board); week changes always slide. */
  intro?: boolean;
}

type BoardMotion = "intro" | "next" | "prev" | undefined;

const colIndex = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Monday-to-Sunday board. Wide screens: one column per day. Narrow screens: one row per day,
 * hiding past days that have nothing on them so the list effectively starts at today.
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
  intro = false,
}: WeekBoardProps) {
  const t = useT();
  const dl = dateLocale(useLocale());
  // Which way the week moved, derived during render (no ref, no effect): the columns re-key
  // on the week, so their entrance animation replays with the matching direction.
  const week = weekStart.getTime();
  const [shown, setShown] = useState<{ week: number; motion: BoardMotion }>({
    week,
    motion: intro ? "intro" : undefined,
  });
  if (shown.week !== week) {
    setShown({ week, motion: week > shown.week ? "next" : "prev" });
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
  const isPastDay = (date: Date) => date < todayStart && !isSameDay(date, now);
  // Classes and holidays count as content, but a past day with nothing open is settled.
  const hasContent = (i: number) =>
    days[i].items.length > 0 || classDays[i].sessions.length > 0 || !!classDays[i].holiday;
  // Narrow screens: when nothing but dashes would remain, collapse the board to one line.
  const narrowEmpty =
    !showGutter &&
    days.every(
      (day, i) =>
        !hasContent(i) || (isPastDay(day.date) && day.items.every((d) => d.done))
    );

  return (
    <div
      role="group"
      aria-label={label}
      data-board-motion={shown.motion}
      style={intro ? ({ "--seq": 1 } as CSSProperties) : undefined}
      className={`flex flex-col gap-1 lg:grid lg:gap-2 ${
        showGutter
          ? "lg:grid-cols-[minmax(0,1.05fr)_repeat(7,minmax(0,1fr))]"
          : "lg:grid-cols-[repeat(7,minmax(0,1fr))]"
      }`}
    >
      {showGutter && (
        <section
          key={`gutter-${week}`}
          aria-label={t.week.overdueAria(overdue.length)}
          style={colIndex(0)}
          className="board-col relative grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-slip)] bg-salmon px-3 pb-4 pt-3 lg:flex lg:flex-col lg:gap-3 lg:px-2.5"
        >
          <header className="flex flex-col lg:flex-row lg:items-baseline lg:justify-between lg:px-0.5">
            <span className="font-display text-[19px] text-danger">{t.week.overdue}</span>
            <span className="text-[12px] font-semibold tabular-nums text-danger">{overdue.length}</span>
          </header>
          <div className="flex min-w-0 flex-col gap-3 pt-1">
            {overdue.map((d) => (
              <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} showDate />
            ))}
          </div>
        </section>
      )}

      {narrowEmpty && (
        <p className="rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-4 py-4 text-center text-[14px] text-muted lg:hidden">{emptyDay}</p>
      )}

      {days.map((day, i) => {
        const today = isSameDay(day.date, now);
        const past = !today && day.date < todayStart;
        const empty = !hasContent(i);
        const settled = day.items.every((d) => d.done);
        const holiday = classDays[i].holiday;
        const daySessions = classDays[i].sessions;
        return (
          <section
            key={day.date.toISOString()}
            style={colIndex(i + (showGutter ? 1 : 0))}
            aria-label={`${format(day.date, t.formats.weekdayMonthDay, { locale: dl })}${today ? t.week.todaySuffix : ""}`}
            aria-current={today ? "date" : undefined}
            className={`board-col relative grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-slip)] px-3 pb-4 pt-3 lg:flex lg:flex-col lg:gap-3 lg:px-2.5 ${
              dense ? "lg:min-h-[8rem]" : "lg:min-h-[15rem]"
            } ${(past && settled) || (empty && (hideEmptyDays || narrowEmpty)) ? "hidden lg:flex" : "grid"} ${
              today
                ? "bg-canary-soft"
                : holiday
                  ? "bg-sky"
                  : past
                    ? "bg-strip-past"
                    : "bg-strip"
            }`}
          >
            {today && (
              <span aria-hidden="true" className="pin -top-[5px] left-1/2 -ml-[5.5px] max-lg:left-[22px]" />
            )}
            <header className="flex flex-col lg:flex-row lg:items-baseline lg:justify-between lg:gap-2 lg:px-0.5">
              <span
                className={`font-display text-[19px] capitalize ${
                  past ? "text-muted" : "text-heading"
                }`}
              >
                {format(day.date, "EEEE", { locale: dl })}
              </span>
              <span
                className={`text-[12px] tabular-nums ${
                  today ? "font-semibold text-heading" : "text-muted"
                }`}
              >
                {today ? t.week.todayAt(format(now, "HH:mm")) : format(day.date, t.formats.monthDay, { locale: dl })}
              </span>
              {holiday && (
                <span className="mt-0.5 text-[12px] font-semibold leading-snug text-accent-2 [overflow-wrap:anywhere] lg:hidden">
                  {t.week.holiday(holiday.subject)}
                </span>
              )}
            </header>
            {holiday && (
              <span className="hidden text-[12px] font-semibold leading-snug text-accent-2 [overflow-wrap:anywhere] lg:block lg:px-0.5">
                {t.week.holiday(holiday.subject)}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-3 pt-1">
              {daySessions.map((s) => (
                <ClassChip key={s.id} session={s} showCourse={showCourse} />
              ))}
              {day.items.map((d) => (
                <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} />
              ))}
              {empty && <span className="text-[13px] text-muted-dim lg:hidden">{emptyDay}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
