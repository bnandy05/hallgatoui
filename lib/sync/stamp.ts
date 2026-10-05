import { stableStringify } from "@/lib/sync/merge";
import { pruneTombstones } from "@/lib/sync/tombstones";
import type { AppData } from "@/lib/types";

// Stamping of store changes, as a pure diff: every item of a synced list that differs from the
// previous state gets `updatedAt = now`, every id that disappeared gets a tombstone. The store
// applies it to the result of each action, so single actions need no bookkeeping and an action that
// leaves an item as it was (a feed sync that found nothing new) leaves its timestamp alone.

export type Stamped = Pick<AppData, "courses" | "deadlines" | "customPlatforms" | "feeds" | "timetableSources" | "tombstones">;

const LISTS = ["courses", "deadlines", "customPlatforms", "feeds", "timetableSources"] as const;

type Item = { id: string; updatedAt?: string };

const differs = (a: unknown, b: unknown) => stableStringify({ ...(a as object), updatedAt: undefined }) !== stableStringify({ ...(b as object), updatedAt: undefined });

function stampList<T extends Item>(prev: T[], next: T[], now: string, removed: string[]): T[] {
  const prevById = new Map(prev.map((i) => [i.id, i]));
  const ids = new Set<string>();
  const out = next.map((item) => {
    ids.add(item.id);
    const before = prevById.get(item.id);
    if (item === before) return item;
    let current = item;
    // A course carries its links and resources, which are items of their own.
    const nested = current as unknown as { links?: Item[]; resources?: Item[] };
    const before2 = before as unknown as { links?: Item[]; resources?: Item[] } | undefined;
    if (Array.isArray(nested.links) || Array.isArray(nested.resources)) {
      current = {
        ...current,
        ...(Array.isArray(nested.links) && { links: stampList(before2?.links ?? [], nested.links, now, removed) }),
        ...(Array.isArray(nested.resources) && { resources: stampList(before2?.resources ?? [], nested.resources, now, removed) }),
      };
    }
    if (!before) return { ...current, updatedAt: now };
    if (!differs(before, current)) return before; // unchanged: keep the old object and its time
    return { ...current, updatedAt: now };
  });
  for (const p of prev) {
    if (ids.has(p.id)) continue;
    removed.push(p.id);
    // Links and resources go with their course.
    const nested = p as unknown as { links?: Item[]; resources?: Item[] };
    for (const child of [...(nested.links ?? []), ...(nested.resources ?? [])]) removed.push(child.id);
  }
  return out;
}

function idsOf(items: Item[], into: Set<string>) {
  for (const item of items) {
    into.add(item.id);
    const nested = item as unknown as { links?: Item[]; resources?: Item[] };
    if (nested.links) idsOf(nested.links, into);
    if (nested.resources) idsOf(nested.resources, into);
  }
}

/**
 * Stamps and tombstones the lists a state patch changes. Returns the patch unchanged when it
 * touches none of the synced lists.
 */
export function stampChanges<P extends Partial<Stamped>>(prev: Stamped, patch: P, now: string): P & Pick<Stamped, "tombstones"> {
  if (!LISTS.some((key) => key in patch)) return patch;
  const out: Partial<Stamped> = { ...patch };
  const removed: string[] = [];
  const present = new Set<string>();
  for (const key of LISTS) {
    const next = patch[key] as Item[] | undefined;
    if (!next) {
      idsOf((prev[key] ?? []) as Item[], present);
      continue;
    }
    (out as Record<string, unknown>)[key] = stampList((prev[key] ?? []) as Item[], next, now, removed);
    idsOf(next, present);
  }
  const tombstones = { ...prev.tombstones };
  for (const id of removed) if (!present.has(id)) tombstones[id] = now;
  // An id that is back (an import, an undo) is no longer deleted.
  for (const id of present) delete tombstones[id];
  out.tombstones = pruneTombstones(tombstones, now);
  return out as P & Pick<Stamped, "tombstones">;
}
