import {
  differenceInMilliseconds,
  endOfWeek,
  format,
  formatDistance,
  isBefore,
  startOfWeek,
} from "date-fns";
import { hu } from "date-fns/locale";
import type { Deadline } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CRITICAL_THRESHOLD_MS = 48 * HOUR_MS;
const SOON_THRESHOLD_MS = 7 * DAY_MS;

export type Urgency = "overdue" | "critical" | "soon" | "later" | "done";

export function urgencyOf(d: Deadline, now: Date): Urgency {
  if (d.done) return "done";
  const due = new Date(d.due);
  if (isBefore(due, now)) return "overdue";
  const diff = differenceInMilliseconds(due, now);
  if (d.critical || diff <= CRITICAL_THRESHOLD_MS) return "critical";
  if (diff <= SOON_THRESHOLD_MS) return "soon";
  return "later";
}

export function isCritical(d: Deadline, now: Date): boolean {
  const urgency = urgencyOf(d, now);
  return urgency === "overdue" || urgency === "critical";
}

export interface WeekGroup {
  weekStart: Date;
  label: string;
  items: Deadline[];
}

export function groupByWeek(deadlines: Deadline[], now: Date): WeekGroup[] {
  const nowWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const nextWeekStart = new Date(nowWeekStart.getTime() + 7 * DAY_MS);
  const prevWeekStart = new Date(nowWeekStart.getTime() - 7 * DAY_MS);

  const byWeek = new Map<number, Deadline[]>();
  for (const d of deadlines) {
    const weekStart = startOfWeek(new Date(d.due), { weekStartsOn: 1 });
    const key = weekStart.getTime();
    const existing = byWeek.get(key);
    if (existing) {
      existing.push(d);
    } else {
      byWeek.set(key, [d]);
    }
  }

  const groups: WeekGroup[] = Array.from(byWeek.entries()).map(([key, items]) => {
    const weekStart = new Date(key);
    const sortedItems = [...items].sort(
      (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()
    );

    let label: string;
    if (key === nowWeekStart.getTime()) {
      label = "Ez a hét";
    } else if (key === nextWeekStart.getTime()) {
      label = "Jövő hét";
    } else if (key === prevWeekStart.getTime()) {
      label = "Múlt hét";
    } else {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      label = `${format(weekStart, "MMM d.", { locale: hu })} – ${format(weekEnd, "MMM d.", { locale: hu })}`;
    }

    return { weekStart, label, items: sortedItems };
  });

  groups.sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  return groups;
}

export function weekSummary(
  deadlines: Deadline[],
  now: Date
): { total: number; critical: number } {
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const relevant = deadlines.filter(
    (d) => !d.done && !isBefore(weekEnd, new Date(d.due))
  );
  return {
    total: relevant.length,
    critical: relevant.filter((d) => isCritical(d, now)).length,
  };
}

export function nextDeadlineFor(
  courseId: string | null,
  deadlines: Deadline[],
  now: Date
): Deadline | undefined {
  return deadlines
    .filter((d) => d.courseId === courseId && !d.done && !isBefore(new Date(d.due), now))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0];
}

export function formatRelative(due: Date, now: Date): string {
  return formatDistance(due, now, { locale: hu, addSuffix: true });
}
