"use client";

import { format, isSameDay, startOfDay } from "date-fns";
import { hu } from "date-fns/locale";
import { bucketWeekByDay } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { DeadlineChip } from "@/components/week/DeadlineChip";

export interface DayAgendaProps {
  weekStart: Date;
  deadlines: Deadline[];
  now: Date;
  showCourse?: boolean;
}

/**
 * One week as a list of day strips, only the days that have something on them: the day on the
 * left, its slips laid out in a wrapping grid. Reads top to bottom, for long horizons where a
 * seven-column board would be mostly empty felt.
 */
export function DayAgenda({ weekStart, deadlines, now, showCourse = true }: DayAgendaProps) {
  const todayStart = startOfDay(now);
  const days = bucketWeekByDay(deadlines, weekStart).filter((day) => day.items.length > 0);

  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => {
        const today = isSameDay(day.date, now);
        const past = !today && day.date < todayStart;
        return (
          <section
            key={day.date.toISOString()}
            aria-label={`${format(day.date, "EEEE, MMM d.", { locale: hu })}${today ? " (ma)" : ""}`}
            aria-current={today ? "date" : undefined}
            className={`relative grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-slip)] px-3 pb-4 pt-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4 ${
              today ? "bg-canary-soft" : past ? "bg-strip-past" : "bg-strip"
            }`}
          >
            {today && <span aria-hidden="true" className="pin -top-[5px] left-[22px]" />}
            <header className="flex flex-col">
              <span className={`font-display text-[19px] capitalize ${past ? "text-muted" : "text-heading"}`}>
                {format(day.date, "EEEE", { locale: hu })}
              </span>
              <span className={`text-[12px] tabular-nums ${today ? "font-semibold text-heading" : "text-muted"}`}>
                {today ? "ma" : format(day.date, "MMM d.", { locale: hu })}
              </span>
            </header>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3 pt-1">
              {day.items.map((d) => (
                <DeadlineChip key={d.id} deadline={d} now={now} showCourse={showCourse} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
