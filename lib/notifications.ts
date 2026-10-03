import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { formatRelative } from "@/lib/radar";
import type { Course, Deadline, NotificationPrefs } from "@/lib/types";

export const LEAD_OPTIONS = [
  { minutes: 1440, label: "1 nappal előtte" },
  { minutes: 180, label: "3 órával előtte" },
  { minutes: 60, label: "1 órával előtte" },
  { minutes: 15, label: "15 perccel előtte" },
] as const;

const MINUTE_MS = 60 * 1000;

/** Includes `due`, so a deadline that was moved notifies again. */
export function notificationKey(d: Deadline, leadMinutes: number): string {
  return `${d.id}:${leadMinutes}:${d.due}`;
}

export interface PendingNotification {
  keys: string[];
  deadlineId: string;
  title: string;
  body: string;
  href: string;
}

/**
 * Notifications to show now. A lead window is open when the deadline is at most that many
 * minutes away. Per deadline at most one notification is returned (for the smallest open
 * window), but it carries the keys of all open windows so that opening the app shortly
 * before a deadline doesn't fire the 1-day and the 1-hour reminder one after another.
 */
export function dueNotifications(
  deadlines: Deadline[],
  courses: Course[],
  prefs: NotificationPrefs,
  sentKeys: Set<string>,
  now: Date
): PendingNotification[] {
  if (!prefs.enabled) return [];

  const result: { due: number; item: PendingNotification }[] = [];
  for (const d of deadlines) {
    if (d.done) continue;
    if (prefs.criticalOnly && !d.critical) continue;
    const due = new Date(d.due);
    const untilDue = due.getTime() - now.getTime();
    if (!(untilDue > 0)) continue; // past (or invalid date)

    const open = prefs.leadMinutes.filter((l) => untilDue <= l * MINUTE_MS);
    if (open.length === 0) continue;
    const keys = open.map((l) => notificationKey(d, l));
    if (keys.every((k) => sentKeys.has(k))) continue;

    const course = d.courseId ? courses.find((c) => c.id === d.courseId) : undefined;
    result.push({
      due: due.getTime(),
      item: {
        keys,
        deadlineId: d.id,
        title: course ? `${course.name}: ${d.title}` : d.title,
        body: `Lejár ${formatRelative(due, now)} (${format(due, "MMM d. HH:mm", { locale: hu })})`,
        href: course ? `/targy/${course.id}` : "/radar",
      },
    });
  }

  return result.sort((a, b) => a.due - b.due).map((r) => r.item);
}
