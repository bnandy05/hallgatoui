import type { AppData, ExportOptions } from "@/lib/types";

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

/**
 * Three-way merge of an id-keyed list. An item changed (or deleted) on one side only takes that
 * side's state; changed on both, or added on both, the remote wins. Order: remote's, then the
 * local-only additions in local order.
 */
function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
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
 * Merges the local state onto a newer remote one, given the last synced `base`. Pure; used when the
 * server answers a save with 409.
 */
export function mergeAppData(base: SyncPayload, local: SyncPayload, remote: SyncPayload): SyncPayload {
  const b = base.data;
  const l = local.data;
  const r = remote.data;
  return {
    data: {
      version: pick(b.version, l.version, r.version),
      courses: mergeById(b.courses, l.courses, r.courses),
      deadlines: mergeById(b.deadlines, l.deadlines, r.deadlines),
      customPlatforms: mergeById(b.customPlatforms, l.customPlatforms, r.customPlatforms),
      feeds: mergeById(b.feeds, l.feeds, r.feeds),
      classSessions: mergeById(b.classSessions, l.classSessions, r.classSessions),
      timetableSources: mergeById(b.timetableSources, l.timetableSources, r.timetableSources),
      ignoredDuplicatePairs: mergeSet(b.ignoredDuplicatePairs, l.ignoredDuplicatePairs, r.ignoredDuplicatePairs),
    },
    exportOptions: mergeOptions(base.exportOptions, local.exportOptions, remote.exportOptions),
  };
}
