"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { format } from "date-fns";
import { Flame } from "lucide-react";
import { useStore } from "@/lib/store";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { isRecentlyChanged, urgencyOf } from "@/lib/radar";
import { deadlineAnchorId } from "@/lib/search";
import type { Deadline } from "@/lib/types";
import { DeadlineDetailDialog } from "@/components/DeadlineItem";
import { DuplicateSources } from "@/components/DuplicateSources";

export interface DeadlineChipProps {
  deadline: Deadline;
  now: Date;
  /** Show the course name (off on a course's own page). */
  showCourse?: boolean;
  /** Show the date instead of only the time (the overdue gutter spans several days). */
  showDate?: boolean;
  /** Position in a grid of slips, so they are pinned up one after another on load. */
  index?: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One deadline pinned to the board. The pin carries the state: course colour while open, red
 * when overdue or critical, gone when done (the slip then hangs loose). A hairline along the
 * bottom edge is as long as the time left in the coming week.
 */
export function DeadlineChip({ deadline, now, showCourse = true, showDate = false, index }: DeadlineChipProps) {
  const t = useT();
  const locale = useLocale();
  const course = useStore((s) => s.courses.find((c) => c.id === deadline.courseId));
  const toggleDone = useStore((s) => s.toggleDone);
  const [open, setOpen] = useState(false);
  const slipRef = useRef<HTMLDivElement>(null);
  const wasDone = useRef(deadline.done);

  // Ticking off pulls the pin and lets the slip swing; unticking pins it back. Only on a change,
  // so slips that load already done just hang there. Set on the node: no re-render, and it stays
  // (the end frame is the resting state) so the entrance animation never replays. Before paint,
  // so the done slip's own entrance never shows for a frame.
  useLayoutEffect(() => {
    if (wasDone.current === deadline.done) return;
    wasDone.current = deadline.done;
    const node = slipRef.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.dataset.motion = deadline.done ? "unpin" : "repin";
  }, [deadline.done]);

  const urgency = urgencyOf(deadline, now);
  const overdue = urgency === "overdue";
  const hot = overdue || urgency === "critical";
  const due = new Date(deadline.due);
  const changed = deadline.previousDue && isRecentlyChanged(deadline, now);
  // A done slip's pin is on its way out: it keeps the colour it had, so it doesn't flash as it goes.
  const wasHot = deadline.done && ["overdue", "critical"].includes(urgencyOf({ ...deadline, done: false }, now));
  const pinColor = hot || wasHot ? "var(--pin)" : (course?.color ?? "var(--border-strong)");
  const left = due.getTime() - now.getTime();
  const share = !deadline.done && left > 0 ? Math.min(1, left / WEEK_MS) : 0;

  return (
    <div
      ref={slipRef}
      id={deadlineAnchorId(deadline.id)}
      data-done={deadline.done}
      style={index === undefined ? undefined : ({ "--i": index } as CSSProperties)}
      className={`slip group px-2.5 pb-2.5 pt-3 ${overdue && !deadline.done ? "bg-salmon" : "bg-card"}`}
    >
      <span
        aria-hidden="true"
        className="pin -top-[4px] left-[11px]"
        style={{ "--pin-color": pinColor } as CSSProperties}
      />
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={deadline.done}
          onChange={() => toggleDone(deadline.id)}
          aria-label={deadline.done ? t.week.markNotDone(deadline.title) : t.week.markDone(deadline.title)}
          className="mt-[3px] h-[15px] w-[15px] shrink-0 cursor-pointer accent-accent"
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`line-clamp-3 w-full text-left text-[13.5px] font-semibold leading-snug [overflow-wrap:anywhere] hover:underline ${
              deadline.done ? "text-muted" : "text-heading"
            }`}
          >
            <span className="strike" data-done={deadline.done}>
              {deadline.title}
            </span>
          </button>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
            <span className={`shrink-0 tabular-nums ${hot && !deadline.done ? "font-semibold text-danger" : ""}`}>
              {format(due, showDate ? t.formats.monthDayTime : "HH:mm", { locale: dateLocale(locale) })}
            </span>
            {deadline.critical && !deadline.done && (
              <Flame className="h-3.5 w-3.5 shrink-0 text-danger" aria-label={t.common.critical} />
            )}
            {changed && <span className="shrink-0 font-semibold text-warning">{t.week.changed}</span>}
            {showCourse && course && (
              <span className="min-w-0 basis-full truncate text-muted" title={course.name}>
                {course.name}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center empty:hidden [&>*]:mt-1.5">
            <DuplicateSources deadline={deadline} small />
          </div>
        </div>
      </div>
      {share > 0 && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-[2px] rounded-r-full ${hot ? "bg-danger/70" : "bg-heading/20"}`}
          style={{ width: `${share * 100}%` }}
        />
      )}
      <DeadlineDetailDialog deadline={deadline} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
