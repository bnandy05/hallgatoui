"use client";

import { format } from "date-fns";
import { useStore } from "@/lib/store";
import type { ClassSession } from "@/lib/types";

export interface ClassChipProps {
  session: ClassSession;
  /** Show the course dot and name (off on a course's own page). */
  showCourse?: boolean;
}

/**
 * One class on the week board. Deliberately quieter than a deadline chip: no checkbox, no
 * fill, a dashed outline and muted text. Classes are not deadlines.
 */
export function ClassChip({ session, showCourse = true }: ClassChipProps) {
  const course = useStore((s) => s.courses.find((c) => c.id === session.courseId));
  const start = new Date(session.start);
  const end = new Date(session.end);
  const mapped = course !== undefined;
  const title = showCourse ? (course?.name ?? session.subject) : session.subject;
  const range = `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;

  return (
    <div
      className="flex items-start gap-1.5 rounded-md border border-dashed border-border/70 px-2 py-1 text-[11px] leading-snug text-muted"
      title={[session.subject, session.group && `csoport: ${session.group}`, session.location]
        .filter(Boolean)
        .join(" · ")}
    >
      <span
        aria-hidden="true"
        className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${mapped ? "" : "bg-muted-dim"}`}
        style={mapped && showCourse ? { backgroundColor: course.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="tabular-nums text-foreground/80">{range}</span>
          {session.kind === "vizsga" && <span className="text-warning">vizsga</span>}
          {session.room && (
            <span className="max-w-full truncate whitespace-nowrap text-muted-dim" title={session.location ?? session.room}>
              {session.room}
            </span>
          )}
        </p>
        <p className="line-clamp-2 [overflow-wrap:anywhere]">{title}</p>
      </div>
    </div>
  );
}
