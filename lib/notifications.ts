import { format } from "date-fns";
import { dateLocale, getMessages, type Locale } from "@/lib/i18n";
import { formatRelative } from "@/lib/radar";
import type { Course, Deadline, NotificationPrefs } from "@/lib/types";

/** Lead times offered in the settings; their labels are in the dictionaries (notifications.lead). */
export const LEAD_OPTIONS = [{ minutes: 1440 }, { minutes: 180 }, { minutes: 60 }, { minutes: 15 }] as const;

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
  now: Date,
  locale: Locale = "hu"
): PendingNotification[] {
  if (!prefs.enabled) return [];
  const t = getMessages(locale);
  const dl = dateLocale(locale);

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
        body: `${t.reminders.dueIn(formatRelative(due, now, dl))} (${format(due, t.formats.monthDayTime, { locale: dl })})`,
        href: course ? `/targy/${course.id}` : "/radar",
      },
    });
  }

  return result.sort((a, b) => a.due - b.due).map((r) => r.item);
}
