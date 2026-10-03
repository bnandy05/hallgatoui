import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { CalendarSnapshot, ExportOptions } from "@/lib/types";
import type { IcalEventDTO } from "@/lib/ical/types";
import { getKv, type Kv } from "@/lib/server/kv";

// Server-only helpers of the calendar subscription routes.

export const MAX_BODY_BYTES = 512 * 1024;
export const TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days without writes
export const SOURCE_FRESH_MS = 15 * 60 * 1000;
export const FEED_FETCH_TIMEOUT_MS = 6_000;
export const WARN_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_FEEDS = 20; // bounds the source fetches one calendar request can trigger
const CREATE_LIMIT = 5; // new subscriptions per client IP...
const CREATE_WINDOW_SECONDS = 60 * 60; // ...per hour

export const NOT_CONFIGURED_ERROR = "A naptár-előfizetés nincs beállítva a szerveren";

export interface StoredSubscription {
  secretHash: string;
  snapshot: CalendarSnapshot;
  updatedAt: string;
}

export interface SourceCache {
  url: string;
  events: IcalEventDTO[] | null; // null: never fetched successfully
  fetchedAt: string; // last attempt
  error?: string;
  failingSince?: string;
}

export const subKey = (token: string) => `sub:${token}`;
export const srcKey = (token: string, feedId: string) => `src:${token}:${feedId}`;

export function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

/** The storage, or a 503 response when the server has none configured. */
export function requireKv(): Kv | Response {
  return getKv() ?? errorResponse(NOT_CONFIGURED_ERROR, 503);
}

export function storageErrorResponse(): Response {
  return errorResponse("A tároló átmenetileg nem érhető el", 503);
}

/** Best-effort client IP; Vercel sets x-forwarded-for. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

/** Limits how many subscriptions one IP can create; returns a 429 response when over the limit. */
export async function checkCreateLimit(kv: Kv, req: Request): Promise<Response | null> {
  let count: number;
  try {
    count = await kv.incr(`rl:create:${clientIp(req)}`, CREATE_WINDOW_SECONDS);
  } catch {
    return storageErrorResponse();
  }
  return count > CREATE_LIMIT
    ? errorResponse("Túl sok új előfizetés, próbáld újra később", 429)
    : null;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCredentials(): { token: string; secret: string } {
  return { token: randomToken(), secret: randomToken() };
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerSecret(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

/** Strips an optional ".ics" suffix; returns null for anything that can't be one of our tokens. */
export function parseToken(raw: string): string | null {
  const token = raw.replace(/\.ics$/i, "");
  return /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Minimal shape validation; returns the normalised snapshot or null. */
export function validateSnapshot(value: unknown): CalendarSnapshot | null {
  if (!isObject(value)) return null;
  const { courses, deadlines, feeds, customPlatforms, options } = value;
  if (
    !Array.isArray(courses) ||
    !Array.isArray(deadlines) ||
    !Array.isArray(feeds) ||
    !Array.isArray(customPlatforms) ||
    feeds.length > MAX_FEEDS
  ) {
    return null;
  }
  if (!courses.every((c) => isObject(c) && typeof c.id === "string" && typeof c.name === "string")) {
    return null;
  }
  if (
    !deadlines.every(
      (d) =>
        isObject(d) &&
        typeof d.id === "string" &&
        typeof d.title === "string" &&
        typeof d.due === "string" &&
        (d.source === "manual" || d.source === "ical")
    )
  ) {
    return null;
  }
  if (
    !feeds.every(
      (f) =>
        isObject(f) &&
        typeof f.id === "string" &&
        f.id.length > 0 &&
        f.id.length <= 100 &&
        typeof f.name === "string" &&
        typeof f.url === "string"
    )
  ) {
    return null;
  }
  const opts = isObject(options) ? options : {};
  const normalized: ExportOptions = {
    includeDone: opts.includeDone === true,
    alarms: opts.alarms !== false,
  };
  return {
    courses: courses as CalendarSnapshot["courses"],
    deadlines: deadlines as CalendarSnapshot["deadlines"],
    feeds: feeds as CalendarSnapshot["feeds"],
    customPlatforms: customPlatforms as CalendarSnapshot["customPlatforms"],
    options: normalized,
  };
}

/** Reads and validates a `{ snapshot }` body, or returns the error response to send. */
export async function readSnapshotBody(req: Request): Promise<CalendarSnapshot | Response> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return errorResponse("Túl nagy kérés", 413);

  let text: string;
  try {
    text = await req.text();
  } catch {
    return errorResponse("Hibás kérés", 400);
  }
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return errorResponse("Túl nagy kérés", 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse("Hibás kérés", 400);
  }
  const snapshot = isObject(body) ? validateSnapshot(body.snapshot) : null;
  return snapshot ?? errorResponse("Hibás vagy hiányos adatok", 400);
}
