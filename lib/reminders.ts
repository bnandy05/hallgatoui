// The header's Emlékeztetők list, derived on every render from store data (nothing is stored).
// Deadline urgency comes from lib/radar.ts; this file only picks and counts. Pure.

import type { Deadline } from "@/lib/types";
import { urgencyOf } from "@/lib/radar";
import type { AwaitingItem, CatchUpGroup, UpcomingAssessment } from "@/lib/catchup";

export const MAX_REMINDER_DEADLINES = 5;
/** Older overdue deadlines are left to the Határidők page, as in the email digest. */
const OVERDUE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

export interface Reminders {
  pending: CatchUpGroup[]; // Rögzítésre vár
  awaiting: AwaitingItem[]; // Eredményre vár
  deadlines: Deadline[]; // Közelgő határidők: overdue, critical, soon (at most 5)
  assessments: UpcomingAssessment[]; // Közelgő számonkérések
  /** What needs the student now: pending groups, late awaiting results, overdue or critical deadlines. */
  badge: number;
}

const ORDER = { overdue: 0, critical: 1, soon: 2 } as const;

export function buildReminders(input: {
  pending: CatchUpGroup[];
  awaiting: AwaitingItem[];
  deadlines: Deadline[]; // deduplicated (useDedupedDeadlines().visible)
  assessments: UpcomingAssessment[];
  now: Date;
}): Reminders {
  const ranked = input.deadlines
    .map((d) => ({ d, u: urgencyOf(d, input.now) }))
    .filter((x): x is { d: Deadline; u: keyof typeof ORDER } => x.u in ORDER)
    .filter((x) => x.u !== "overdue" || input.now.getTime() - Date.parse(x.d.due) <= OVERDUE_LOOKBACK_MS);
  ranked.sort((a, b) => ORDER[a.u] - ORDER[b.u] || a.d.due.localeCompare(b.d.due));
  const hot = ranked.filter((x) => x.u !== "soon").length;
  return {
    pending: input.pending,
    awaiting: input.awaiting,
    deadlines: ranked.slice(0, MAX_REMINDER_DEADLINES).map((x) => x.d),
    assessments: input.assessments,
    badge: input.pending.length + input.awaiting.filter((a) => a.overdue).length + hot,
  };
}
