// Deletion records: item id -> ISO time it was deleted. Kept so a merge can tell "deleted on the
// other device" from "never had it". Pure.

export const TOMBSTONE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
export const TOMBSTONE_MAX_COUNT = 5000;

/** Drops tombstones older than 60 days and keeps at most the newest 5000. */
export function pruneTombstones(tombstones: Record<string, string>, now: string): Record<string, string> {
  const cutoff = new Date(now).getTime() - TOMBSTONE_MAX_AGE_MS;
  const kept = Object.entries(tombstones).filter(([, at]) => {
    const t = new Date(at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  kept.sort(([, a], [, b]) => (a < b ? 1 : a > b ? -1 : 0)); // newest first
  return Object.fromEntries(kept.slice(0, TOMBSTONE_MAX_COUNT));
}

/** Union of two tombstone maps, the later time per id. */
export function mergeTombstones(a: Record<string, string> = {}, b: Record<string, string> = {}): Record<string, string> {
  const out = { ...a };
  for (const [id, at] of Object.entries(b)) if (!(id in out) || at > out[id]) out[id] = at;
  return out;
}
