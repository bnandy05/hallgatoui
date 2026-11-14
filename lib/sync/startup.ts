import type { AppData } from "@/lib/types";
import { hasSemesterContent } from "@/lib/semesterArchive";

export type StartupDecision = { kind: "use-server" } | { kind: "upload-local" };

/** True when the data holds anything the user created or imported. */
export function hasAppData(d: AppData): boolean {
  return hasSemesterContent(d) || d.customPlatforms.length > 0 || !!d.semesterArchives?.length;
}

/**
 * First load after sign-in: upload the browser's cache only into a brand-new (version 0) account,
 * and only when the cache belongs to this user or to nobody. Another user's cache is never used.
 */
export function resolveStartupData(input: {
  userId: string;
  cacheOwner: string | null;
  cacheHasData: boolean;
  serverVersion: number;
}): StartupDecision {
  const ownCache = input.cacheOwner === input.userId || input.cacheOwner === null;
  return input.serverVersion === 0 && input.cacheHasData && ownCache ? { kind: "upload-local" } : { kind: "use-server" };
}
