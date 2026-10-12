"use client";

import { format } from "date-fns";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import type { ClassSession } from "@/lib/types";

export interface ClassChipProps {
  session: ClassSession;
  /** Show the course dot and name (off on a course's own page). */
  showCourse?: boolean;
}

/**
 * One class on the week board, printed on sky-blue timetable paper and taped flat: no pin, no
 * checkbox, no shadow. Classes are not deadlines.
 */
export function ClassChip({ session, showCourse = true }: ClassChipProps) {
  const t = useT();
  const course = useStore((s) => s.courses.find((c) => c.id === session.courseId));
  const start = new Date(session.start);
  const end = new Date(session.end);
  const mapped = course !== undefined;
  const title = showCourse ? (course?.name ?? session.subject) : session.subject;
  const range = `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;

  return (
    <div
      className="flex items-start gap-1.5 rounded-[var(--radius-slip)] bg-sky/80 px-2 py-1.5 text-fine leading-snug text-muted"
      title={[session.subject, session.group && t.week.classGroup(session.group), session.location]
        .filter(Boolean)
        .join(" · ")}
    >
      <span
        aria-hidden="true"
        className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${mapped && showCourse ? "" : "bg-accent-2"}`}
        style={mapped && showCourse ? { backgroundColor: course.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold tabular-nums text-heading">{range}</span>
          {session.kind === "vizsga" && <span className="font-semibold text-warning">{t.week.exam}</span>}
          {session.room && (
            <span className="max-w-full truncate whitespace-nowrap text-muted" title={session.location ?? session.room}>
              {session.room}
            </span>
          )}
        </p>
        <p className="line-clamp-2 [overflow-wrap:anywhere]">{title}</p>
      </div>
    </div>
  );
}
