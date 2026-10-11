import { randomBytes } from "node:crypto";
import type { IcalEventDTO } from "@/lib/ical/types";
import { getMessages, type Locale, type Messages } from "@/lib/i18n";
import type { Kv } from "@/lib/server/kv";

// Server-only constants, keys and helpers of the calendar subscription and the digest.

export const TTL_SECONDS = 180 * 24 * 60 * 60; // feed caches expire after 180 days without use
export const SOURCE_FRESH_MS = 15 * 60 * 1000;
export const FEED_FETCH_TIMEOUT_MS = 6_000;
export const WARN_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_IGNORED_PAIRS = 2000;
export const MAX_CLASS_SESSIONS = 1500;
export const MAX_FEEDS = 20; // bounds the source fetches one calendar request can trigger

export interface SourceCache {
  url: string;
  events: IcalEventDTO[] | null; // null: never fetched successfully
  fetchedAt: string; // last attempt
  error?: string;
  failingSince?: string;
}

/** Public calendar token → `{ userId }`. */
export const subKey = (token: string) => `sub:${token}`;
/** Feed caches and the due-change record are keyed by user, so rotating the token keeps them. */
export const srcKey = (userId: string, feedId: string) => `src:${userId}:${feedId}`;
/** Per-user record of seen due-date changes (see lib/server/dueChanges.ts). */
export const chgKey = (userId: string) => `chg:${userId}`;
/** Email digest settings of a user (see lib/server/digest.ts). */
export const digKey = (userId: string) => `dig:${userId}`;
/** Set of userIds with a digest, visited by the daily cron. */
export const DIGEST_INDEX_KEY = "dig:index";

/** Rendered calendar of a user's view (see lib/server/calendar.ts), and the set listing them. */
export const icsKey = (userId: string, locale: Locale, view: string) => `ics:${userId}:${locale}:${view}`;
export const icsIndexKey = (userId: string) => `icsk:${userId}`;
export const ICS_TTL_SECONDS = 900;

export type ErrorCode = keyof Messages["errors"];

/** A JSON error in the given language; `code` is stable for clients that branch on it. */
export function errorResponse(locale: Locale, code: ErrorCode, status: number, suffix = ""): Response {
  return Response.json({ error: getMessages(locale).errors[code] + suffix, code }, { status });
}

export function storageErrorResponse(locale: Locale): Response {
  return errorResponse(locale, "storage_unavailable", 503);
}

/** Drops a user's rendered calendars (after a data save, a language change, turning the subscription off). */
export async function dropRenderedCalendars(kv: Kv, userId: string): Promise<void> {
  const keys = await kv.smembers(icsIndexKey(userId));
  if (keys.length > 0) await kv.del(...keys);
  for (const key of keys) await kv.srem(icsIndexKey(userId), key);
}

/** Best-effort client IP; Vercel sets x-forwarded-for. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

/** A new public calendar token (32 random bytes, base64url). */
export function generateCalendarToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Strips an optional ".ics" suffix; returns null for anything that can't be one of our tokens. */
export function parseToken(raw: string): string | null {
  const token = raw.replace(/\.ics$/i, "");
  return /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : null;
}
