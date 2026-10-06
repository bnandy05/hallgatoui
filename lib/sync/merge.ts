import type { AppData, Deadline, ExportOptions } from "@/lib/types";
import { syncNow } from "@/lib/sync/clock";
import { mergeTombstones, pruneTombstones } from "@/lib/sync/tombstones";

/** What is synced between the browser and the server. */
export interface SyncPayload {
  data: AppData;
  exportOptions: ExportOptions;
}

/** JSON with sorted object keys, so equal values compare equal whatever their key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

type Item = { id: string; updatedAt?: string };

/** Plain three-way merge for lists without timestamps: changed on both sides, the remote wins. */
function mergeByIdPlain<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const baseMap = new Map(base.map((i) => [i.id, i]));
  const localMap = new Map(local.map((i) => [i.id, i]));
  const out: T[] = [];

  for (const r of remote) {
    const b = baseMap.get(r.id);
    const l = localMap.get(r.id);
    if (!b) {
      out.push(r); // added remotely (or on both sides): remote
    } else if (!l) {
      // Deleted locally: gone unless the remote changed it meanwhile.
      if (!same(r, b)) out.push(r);
    } else if (!same(l, b) && same(r, b)) {
      out.push(l); // only changed locally
    } else {
      out.push(r);
    }
  }

  const remoteIds = new Set(remote.map((r) => r.id));
  for (const l of local) {
    if (!remoteIds.has(l.id) && !baseMap.has(l.id)) out.push(l); // local-only addition
  }
  return out;
}

const timeOf = (x: Item | undefined) => x?.updatedAt ?? "";

/**
 * Field-level merge of one item present on both sides. A field changed on one side takes that side;
 * changed on both (or, without a base, different), the side edited later wins, a tie the remote.
 * `links` and `resources` of a course are id-keyed lists and merge recursively.
 */
function mergeItem<T extends Item>(b: T | undefined, l: T, r: T, tombstones: Record<string, string>): T {
  const remoteWins = timeOf(r) >= timeOf(l);
  const out: Record<string, unknown> = {};
  const L = l as unknown as Record<string, unknown>;
  const R = r as unknown as Record<string, unknown>;
  const B = b as unknown as Record<string, unknown> | undefined;
  for (const key of new Set([...Object.keys(R), ...Object.keys(L)])) {
    if (key === "updatedAt") continue;
    let value: unknown;
    if (same(L[key], R[key])) {
      value = L[key];
    } else if ((key === "links" || key === "resources") && Array.isArray(L[key]) && Array.isArray(R[key])) {
      value = mergeById((B?.[key] as Item[] | undefined) ?? [], L[key] as Item[], R[key] as Item[], tombstones);
    } else if (B) {
      const localChanged = !same(L[key], B[key]);
      const remoteChanged = !same(R[key], B[key]);
      if (localChanged && !remoteChanged) value = L[key];
      else if (remoteChanged && !localChanged) value = R[key];
      else value = remoteWins ? R[key] : L[key];
    } else {
      value = remoteWins ? R[key] : L[key];
    }
    if (value !== undefined) out[key] = value;
  }
  const updatedAt = timeOf(l) > timeOf(r) ? l.updatedAt : r.updatedAt;
  if (updatedAt) out.updatedAt = updatedAt;
  return out as unknown as T;
}

/** Item-level merge: the side that changed wins; changed on both, the later edit (a tie the remote). */
function mergeWhole<T extends Item>(b: T | undefined, l: T, r: T): T {
  if (same(l, r)) return l;
  if (b) {
    const localChanged = !same(l, b);
    const remoteChanged = !same(r, b);
    if (localChanged && !remoteChanged) return l;
    if (remoteChanged && !localChanged) return r;
  }
  return timeOf(r) >= timeOf(l) ? r : l;
}

/**
 * Time-aware three-way merge of an id-keyed list (see the table in docs/superpowers/plans/
 * 2026-10-05-offline-and-series.md). Items on both sides merge field by field; a deletion beats an
 * edit only when the edit is older than the tombstone. Order: remote's, then local-only items in
 * local order.
 */
function mergeById<T extends Item>(
  base: T[],
  local: T[],
  remote: T[],
  tombstones: Record<string, string>,
  whole = false
): T[] {
  const baseMap = new Map(base.map((i) => [i.id, i]));
  const localMap = new Map(local.map((i) => [i.id, i]));
  const remoteMap = new Map(remote.map((i) => [i.id, i]));
  const out: T[] = [];

  const resolve = (id: string): T | undefined => {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const deletedAt = tombstones[id] ?? "";
    if (l && r) return whole ? mergeWhole(b, l, r) : mergeItem(b, l, r, tombstones);
    const only = l ?? r;
    if (!only) return undefined;
    // Present on one side only: added there, or deleted on the other side.
    if (!b) return deletedAt > timeOf(only) ? undefined : only;
    if (same(only, b)) return undefined; // deleted on one side, untouched on the other
    return timeOf(only) > deletedAt ? only : undefined; // edited vs deleted: the later one
  };

  for (const r of remote) {
    const item = resolve(r.id);
    if (item) out.push(item);
  }
  for (const l of local) {
    if (remoteMap.has(l.id)) continue;
    const item = resolve(l.id);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Collapses deadlines that are the same feed event under different ids (two devices synced a feed
 * while out of step). The remote's id stays; done/critical/course come from the copy edited later.
 * Returns the dropped ids so the caller can tombstone them. Pure.
 */
export function collapseFeedDuplicates(
  deadlines: Deadline[],
  remoteIds: Set<string>
): { deadlines: Deadline[]; dropped: string[] } {
  const groups = new Map<string, Deadline[]>();
  for (const d of deadlines) {
    if (!d.feedId || !d.externalUid) continue;
    const key = `${d.feedId}\u0000${d.externalUid}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const replaced = new Map<string, Deadline>();
  const dropped: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.find((d) => remoteIds.has(d.id)) ?? group[0];
    // Latest edit wins; on a tie the kept (remote) copy.
    const latest = group.reduce((best, d) => (timeOf(d) > timeOf(best) ? d : best), keep);
    const updatedAt = timeOf(latest) || undefined;
    replaced.set(keep.id, {
      ...keep,
      done: latest.done,
      critical: latest.critical,
      courseId: latest.courseId,
      ...(updatedAt && { updatedAt }),
    });
    for (const d of group) if (d !== keep) dropped.push(d.id);
  }
  if (dropped.length === 0) return { deadlines, dropped };
  const gone = new Set(dropped);
  return { deadlines: deadlines.filter((d) => !gone.has(d.id)).map((d) => replaced.get(d.id) ?? d), dropped };
}

/** Set merge: the remote set, plus the local additions, minus the local removals. */
function mergeSet(base: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(base);
  const localSet = new Set(local);
  const removed = new Set(base.filter((x) => !localSet.has(x)));
  const out = remote.filter((x) => !removed.has(x));
  for (const x of local) if (!baseSet.has(x) && !out.includes(x)) out.push(x);
  return out;
}

/** The side that changed wins; changed on both, the remote. */
function pick<T>(base: T, local: T, remote: T): T {
  return !same(local, base) && same(remote, base) ? local : remote;
}

/** Merges the options field by field, so two devices changing different options both keep them. */
function mergeOptions(base: ExportOptions, local: ExportOptions, remote: ExportOptions): ExportOptions {
  const out = { ...remote } as Record<string, unknown>;
  for (const key of Object.keys(local) as (keyof ExportOptions)[]) {
    out[key] = pick(base[key], local[key], remote[key]);
  }
  return out as unknown as ExportOptions;
}

/**
 * Merges the local state onto a newer remote one, given the last synced `base`. Pure (`now` only
 * stamps tombstones and prunes); used when the server answers a save with 409.
 */
export function mergeAppData(base: SyncPayload, local: SyncPayload, remote: SyncPayload, now: string = syncNow()): SyncPayload {
  const b = base.data;
  const l = local.data;
  const r = remote.data;
  let tombstones = mergeTombstones(l.tombstones, r.tombstones);

  const courses = mergeById(b.courses, l.courses, r.courses, tombstones);
  const merged = mergeById(b.deadlines, l.deadlines, r.deadlines, tombstones);
  const collapsed = collapseFeedDuplicates(merged, new Set(r.deadlines.map((d) => d.id)));
  for (const id of collapsed.dropped) tombstones[id] = now;
  const customPlatforms = mergeById(b.customPlatforms, l.customPlatforms, r.customPlatforms, tombstones);
  const feeds = mergeById(b.feeds, l.feeds, r.feeds, tombstones);
  const timetableSources = mergeById(b.timetableSources, l.timetableSources, r.timetableSources, tombstones);
  // A rule set merges as one block, so two devices' edits can't mix into an invalid set.
  const requirementRules = mergeById(b.requirementRules ?? [], l.requirementRules ?? [], r.requirementRules ?? [], tombstones, true);
  const requirementResults = mergeById(b.requirementResults ?? [], l.requirementResults ?? [], r.requirementResults ?? [], tombstones);

  // An item that survived (edited after its deletion) is not deleted any more.
  const alive = new Set<string>();
  const collect = (items: { id: string; links?: { id: string }[]; resources?: { id: string }[] }[]) => {
    for (const i of items) {
      alive.add(i.id);
      i.links?.forEach((x) => alive.add(x.id));
      i.resources?.forEach((x) => alive.add(x.id));
    }
  };
  collect(courses);
  collect(collapsed.deadlines);
  collect(customPlatforms);
  collect(feeds);
  collect(timetableSources);
  collect(requirementRules);
  collect(requirementResults);
  tombstones = Object.fromEntries(Object.entries(tombstones).filter(([id]) => !alive.has(id)));

  return {
    data: {
      version: pick(b.version, l.version, r.version),
      courses,
      deadlines: collapsed.deadlines,
      customPlatforms,
      feeds,
      classSessions: mergeByIdPlain(b.classSessions, l.classSessions, r.classSessions),
      timetableSources,
      requirementRules,
      requirementResults,
      ignoredDuplicatePairs: mergeSet(b.ignoredDuplicatePairs, l.ignoredDuplicatePairs, r.ignoredDuplicatePairs),
      tombstones: pruneTombstones(tombstones, now),
    },
    // Per-option timestamps are not worth it: the same option changed on two devices takes the remote's.
    exportOptions: mergeOptions(base.exportOptions, local.exportOptions, remote.exportOptions),
  };
}
