import type { Deadline } from "@/lib/types";
import { deadlineIdentity } from "@/lib/ical/dedupe";

// Server-side memory of due-date changes, so the 48 h "(módosult)" window starts when the
// change is first seen, not at every request. Pure: the caller loads and stores the record.

export type DueRecord = Record<string, { due: string; previousDue?: string; changedAt?: string }>;

export interface TrackResult {
  deadlines: Deadline[];
  record: DueRecord;
  /** The record differs from the one passed in (new, moved or pruned entries): write it back. */
  changed: boolean;
}

const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/**
 * `deadlines` are the freshly merged ones; `snapshot` are the deadlines of the stored snapshot
 * (what the browser last pushed). A feed deadline without a record entry is seeded from its
 * snapshot version, or from itself when the snapshot doesn't have it, so a first request
 * never invents a change. Only feed deadlines are tracked; the output takes
 * previousDue/dueChangedAt from the record, whatever mergeFeedSync set.
 */
export function trackDueChanges(
  record: DueRecord | null,
  deadlines: Deadline[],
  now: Date,
  snapshot: Deadline[] = deadlines
): TrackResult {
  const snapshotByIdentity = new Map<string, Deadline>();
  for (const d of snapshot) {
    if (d.source === "ical") snapshotByIdentity.set(deadlineIdentity(d), d);
  }

  const next: DueRecord = {};
  let changed = false;

  const output = deadlines.map((d) => {
    if (d.source !== "ical") return d;
    const identity = deadlineIdentity(d);
    let entry = record?.[identity];
    if (!entry) {
      const seed = snapshotByIdentity.get(identity) ?? d;
      entry = { due: seed.due, previousDue: seed.previousDue, changedAt: seed.dueChangedAt };
      changed = true;
    }
    if (!sameInstant(entry.due, d.due)) {
      entry = { due: d.due, previousDue: entry.due, changedAt: now.toISOString() };
      changed = true;
    }
    next[identity] = entry;

    const { previousDue, changedAt } = entry;
    const { previousDue: _p, dueChangedAt: _c, ...rest } = d;
    void _p;
    void _c;
    return { ...rest, ...(previousDue && { previousDue }), ...(changedAt && { dueChangedAt: changedAt }) };
  });

  if (record && Object.keys(record).some((identity) => !(identity in next))) changed = true;
  return { deadlines: output, record: next, changed };
}
