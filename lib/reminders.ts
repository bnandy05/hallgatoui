// The header's Emlékeztetők list, derived on every render from store data (nothing is stored).
// Deadline urgency comes from lib/radar.ts; this file only picks and counts. Pure.

import type { Deadline } from "@/lib/types";
import { urgencyOf } from "@/lib/radar";

export const MAX_REMINDER_DEADLINES = 5;
/** Older overdue deadlines are left to the Határidők page, as in the email digest. */
const OVERDUE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

export interface Reminders {
  deadlines: Deadline[]; // Közelgő határidők: overdue, critical, soon (at most 5)
  /** What needs the student now: overdue or critical deadlines. */
  badge: number;
}

const ORDER = { overdue: 0, critical: 1, soon: 2 } as const;

export function buildReminders(input: {
  deadlines: Deadline[]; // deduplicated (useDedupedDeadlines().visible)
  now: Date;
}): Reminders {
  const ranked = input.deadlines
    .map((d) => ({ d, u: urgencyOf(d, input.now) }))
    .filter((x): x is { d: Deadline; u: keyof typeof ORDER } => x.u in ORDER)
    .filter((x) => x.u !== "overdue" || input.now.getTime() - Date.parse(x.d.due) <= OVERDUE_LOOKBACK_MS);
  ranked.sort((a, b) => ORDER[a.u] - ORDER[b.u] || a.d.due.localeCompare(b.d.due));
  return {
    deadlines: ranked.slice(0, MAX_REMINDER_DEADLINES).map((x) => x.d),
    badge: ranked.filter((x) => x.u !== "soon").length,
  };
}
