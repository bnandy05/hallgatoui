import type { AppData, ExportOptions } from "@/lib/types";
import { parseAppData } from "@/lib/importData";
import { icsIndexKey, MAX_CLASS_SESSIONS, MAX_FEEDS } from "@/lib/server/subscription";
import type { AccountStore, CasResult } from "@/lib/server/account/store";

// Validation and saving of an account's data document. Server-only (uses the account store).

export const MAX_DATA_BYTES = 900_000; // below the Upstash request size limit

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates a full AppData from the client (shape checks and URL sanitising of the JSON
 * import, plus the server's caps). Returns null for anything malformed or over a cap.
 */
export function validateAppData(value: unknown): AppData | null {
  let data: AppData;
  try {
    data = parseAppData(value);
  } catch {
    return null; // wrong shape; a crash on a null item lands here too
  }
  if (data.feeds.length > MAX_FEEDS) return null;
  const feedsOk = data.feeds.every(
    (f) => isObject(f) && typeof f.id === "string" && f.id.length > 0 && f.id.length <= 100 && typeof f.name === "string"
  );
  const platformsOk = data.customPlatforms.every(
    (p) => isObject(p) && typeof p.id === "string" && typeof p.name === "string" && typeof p.color === "string"
  );
  if (!feedsOk || !platformsOk) return null;
  return { ...data, classSessions: data.classSessions.slice(0, MAX_CLASS_SESSIONS) };
}

/** Defaults for anything missing, as the calendar snapshot always did. */
export function validateExportOptions(value: unknown): ExportOptions {
  const o = isObject(value) ? value : {};
  return {
    includeDone: o.includeDone === true,
    alarms: o.alarms !== false,
    weeklySummary: o.weeklySummary !== false,
    studyBlocks: o.studyBlocks !== false,
    dedupe: o.dedupe !== false,
    includeClasses: o.includeClasses === true,
  };
}

/** Compare-and-set save; a successful save drops the user's rendered calendars. */
export async function saveData(
  store: AccountStore,
  userId: string,
  baseVersion: number,
  data: AppData,
  exportOptions: ExportOptions,
  now: Date
): Promise<CasResult> {
  const result = await store.casData(userId, baseVersion, { updatedAt: now.toISOString(), data, exportOptions });
  if (result.ok) {
    const keys = await store.kv.smembers(icsIndexKey(userId));
    if (keys.length > 0) await store.kv.del(...keys);
    for (const key of keys) await store.kv.srem(icsIndexKey(userId), key);
  }
  return result;
}
