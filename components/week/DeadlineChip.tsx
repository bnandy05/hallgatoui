"use client";

import { useState } from "react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { Flame } from "lucide-react";
import { useStore } from "@/lib/store";
import { isRecentlyChanged, urgencyOf } from "@/lib/radar";
import type { Deadline } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { DeadlineItem } from "@/components/DeadlineItem";
import { DuplicateSources } from "@/components/DuplicateSources";

export interface DeadlineChipProps {
  deadline: Deadline;
  now: Date;
  /** Show the course dot and name (off on a course's own page). */
  showCourse?: boolean;
  /** Show the date instead of only the time (the overdue gutter spans several days). */
  showDate?: boolean;
}

/** One deadline on the week board: tick it off in place, open the title for every detail. */
export function DeadlineChip({ deadline, now, showCourse = true, showDate = false }: DeadlineChipProps) {
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const toggleDone = useStore((s) => s.toggleDone);
  const [open, setOpen] = useState(false);

  const urgency = urgencyOf(deadline, now);
  const hot = urgency === "overdue" || urgency === "critical";
  const due = new Date(deadline.due);
  const changed = deadline.previousDue && isRecentlyChanged(deadline, now);

  return (
    <div
      className={`group flex items-start gap-2 rounded-md border bg-inset px-2 py-1.5 transition-colors duration-150 ${
        hot && !deadline.done
          ? "border-danger/45 hover:border-danger"
          : "border-border/70 hover:border-border-strong"
      }`}
    >
      <input
        type="checkbox"
        checked={deadline.done}
        onChange={() => toggleDone(deadline.id)}
        aria-label={`${deadline.title}: ${deadline.done ? "megjelölés nem késznek" : "megjelölés késznek"}`}
        className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent"
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`line-clamp-2 w-full text-left text-[12.5px] font-medium leading-snug [overflow-wrap:anywhere] hover:text-accent-text hover:underline hover:underline-offset-2 ${
            deadline.done ? "text-muted line-through" : "text-foreground"
          }`}
        >
          {deadline.title}
        </button>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          <span className={`shrink-0 tabular-nums ${hot && !deadline.done ? "text-danger" : ""}`}>
            {format(due, showDate ? "MMM d. HH:mm" : "HH:mm", { locale: hu })}
          </span>
          {deadline.critical && !deadline.done && (
            <Flame className="h-3 w-3 shrink-0 text-danger" aria-label="Kritikus" />
          )}
          {changed && <span className="shrink-0 text-warning">módosult</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center">
          <DuplicateSources deadline={deadline} small />
        </div>
        {showCourse && course && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-muted">
            <span
              aria-hidden="true"
              className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: course.color }}
            />
            <span className="[overflow-wrap:anywhere]">{course.name}</span>
          </p>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Határidő" size="lg">
        <DeadlineItem deadline={deadline} />
      </Dialog>
    </div>
  );
}
