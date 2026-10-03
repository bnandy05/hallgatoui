"use client";

import { useMemo, type ReactNode } from "react";
import { format, isSameDay, startOfDay } from "date-fns";
import { hu } from "date-fns/locale";
import { bucketWeekByDay, urgencyOf } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { DeadlineChip } from "@/components/week/DeadlineChip";

export interface WeekBoardProps {
  weekStart: Date;
  deadlines: Deadline[];
  now: Date;
  /** Pull every overdue item (any week) into a "Lejárt" gutter left of Monday. */
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

// The red notebook margin line, drawn as the vertical "now" line on today's column.
const NOW_LINE =
  "before:pointer-events-none before:absolute before:inset-y-0 before:-left-px before:w-0.5 before:bg-danger/70";

/**
 * Monday-to-Sunday board. Wide screens: one column per day. Narrow screens: one row per day,
 * hiding past days that have nothing on them so the list effectively starts at today.
 */
export function WeekBoard({
  weekStart,
  deadlines,
  now,
  gutter = false,
  showCourse = true,
  label,
  emptyDay = "—",
  hideEmptyDays = false,
  dense = false,
}: WeekBoardProps) {
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

  const showGutter = overdue.length > 0;
  const todayStart = startOfDay(now);
  // Narrow screens: when nothing but dashes would remain, collapse the board to one line.
  const narrowEmpty =
    !showGutter &&
    days.every(
      (day) =>
        day.items.length === 0 ||
        (day.date < todayStart && !isSameDay(day.date, now) && day.items.every((d) => d.done))
    );

  return (
    <div
      role="group"
      aria-label={label}
      className={`overflow-hidden rounded-[var(--radius)] border border-border bg-card lg:grid ${
        showGutter
          ? "lg:grid-cols-[minmax(0,1.05fr)_repeat(7,minmax(0,1fr))]"
          : "lg:grid-cols-[repeat(7,minmax(0,1fr))]"
      }`}
    >
      {showGutter && (
        <section
          aria-label={`Lejárt, ${overdue.length} elem`}
          className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 bg-danger/[0.06] px-3 py-3 lg:flex lg:flex-col lg:gap-2"
        >
          <header className="flex flex-col lg:flex-row lg:items-baseline lg:justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-danger">Lejárt</span>
            <span className="text-[11px] tabular-nums text-danger/80">{overdue.length}</span>
          </header>
          <div className="flex min-w-0 flex-col gap-1.5">
            {overdue.map((d) => (
              <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} showDate />
            ))}
          </div>
        </section>
      )}

      {narrowEmpty && (
        <p className="px-3 py-3 text-xs text-muted-dim lg:hidden">{emptyDay}</p>
      )}

      {days.map((day, i) => {
        const today = isSameDay(day.date, now);
        const past = !today && day.date < todayStart;
        const empty = day.items.length === 0;
        const settled = day.items.every((d) => d.done);
        return (
          <section
            key={day.date.toISOString()}
            aria-label={`${format(day.date, "EEEE, MMM d.", { locale: hu })}${today ? " (ma)" : ""}`}
            aria-current={today ? "date" : undefined}
            className={`relative grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-border/60 px-3 py-3 lg:flex ${dense ? "lg:min-h-[7.5rem]" : "lg:min-h-[12.5rem]"} lg:flex-col lg:gap-2 ${
              // Every row draws its top rule and shifts up 1px, so the first visible row's rule is
              // clipped by the board's edge whichever past days are hidden.
              `-mt-px border-t lg:mt-0 lg:border-t-0 ${i > 0 || showGutter ? "lg:border-l" : ""}`
            } ${(past && settled) || (empty && (hideEmptyDays || narrowEmpty)) ? "hidden lg:flex" : "grid"} ${past ? "lg:bg-inset/40" : ""} ${
              today ? `bg-accent-soft/40 ${NOW_LINE}` : ""
            }`}
          >
            <header className="flex flex-col">
              <span
                className={`text-xs font-bold lowercase tracking-[0.04em] ${
                  today ? "text-accent-text" : past ? "text-muted-dim" : "text-heading"
                }`}
              >
                {format(day.date, "EEEE", { locale: hu })}
              </span>
              <span
                className={`text-[11px] tabular-nums ${
                  today ? "font-semibold text-accent-text" : "text-muted-dim"
                }`}
              >
                {today ? `ma · most ${format(now, "HH:mm")}` : format(day.date, "MMM d.", { locale: hu })}
              </span>
            </header>
            <div className="flex min-w-0 flex-col gap-1.5">
              {day.items.map((d) => (
                <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} />
              ))}
              {empty && <span className="text-xs text-muted-dim lg:hidden">{emptyDay}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
