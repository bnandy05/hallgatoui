import { visibleSessions } from "@/lib/ical/neptun";
import { buildCalendar } from "@/lib/ical/export";
import { useStore } from "@/lib/store";
import type { DigestFrequency, DigestStatus } from "@/lib/digest";

// Browser side of the account's calendar subscription and email digest. Both live on the server
// under the signed-in account; these wrappers never throw, errors come back as Hungarian messages.

const CALENDAR_API = "/api/fiok/naptar";
const DIGEST_API = "/api/fiok/hirlevel";
const GENERIC_ERROR = "A naptár-előfizetés nem érhető el";
const NETWORK_ERROR = "A szerver nem érhető el";

/** Path part of the subscription URL; add an origin or a scheme in front of it. */
export function subscriptionPath(token: string): string {
  return `/api/naptar/${token}.ics`;
}

type Failure = { error: string };

async function errorFrom(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (typeof json.error === "string") return json.error;
  } catch {
    // Not JSON: fall through.
  }
  return GENERIC_ERROR;
}

async function request(url: string, method: string, body?: unknown): Promise<Response | Failure> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    return res.ok ? res : { error: await errorFrom(res) };
  } catch {
    return { error: NETWORK_ERROR };
  }
}

const failed = (r: Response | Failure): r is Failure => !(r instanceof Response);

async function tokenRequest(method: string, url = CALENDAR_API): Promise<{ token: string | null } | Failure> {
  const res = await request(url, method);
  if (failed(res)) return res;
  try {
    const json = (await res.json()) as { token?: unknown };
    return { token: typeof json.token === "string" ? json.token : null };
  } catch {
    return { error: GENERIC_ERROR };
  }
}

/** The account's calendar token, or null when the subscription is off. */
export const fetchCalendarToken = () => tokenRequest("GET");
/** Turns the subscription on (keeps the existing token if there is one). */
export const createCalendarToken = () => tokenRequest("POST");
/** New token: the old link stops working. */
export const rotateCalendarToken = () => tokenRequest("POST", `${CALENDAR_API}?uj=1`);
/** Turns the subscription off. Returns an error message or null. */
export async function deleteCalendarToken(): Promise<string | null> {
  const res = await request(CALENDAR_API, "DELETE");
  return failed(res) ? res.error : null;
}

/** One-time .ics download built in the browser; works without a subscription or server. */
export function downloadCalendar(): void {
  const { courses, deadlines, exportOptions, feeds, customPlatforms, ignoredDuplicatePairs, classSessions, timetableSources } =
    useStore.getState();
  const ics = buildCalendar({
    courses,
    deadlines,
    options: exportOptions,
    now: new Date(),
    appUrl: window.location.origin,
    feeds,
    customPlatforms,
    ignoredDuplicatePairs,
    classSessions: visibleSessions(classSessions, timetableSources),
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hallgatoi-reteg.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `error` is set on failure; otherwise `digest` (null when there is none). */
interface DigestResult {
  digest?: DigestStatus | null;
  email?: string;
  available?: boolean;
  error?: string;
}

async function digestRequest(method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<DigestResult> {
  const res = await request(DIGEST_API, method, body);
  if (failed(res)) return { error: res.error };
  if (method === "DELETE") return { digest: null };
  try {
    const json = (await res.json()) as { digest?: DigestStatus | null; email?: string; available?: boolean };
    return { digest: json.digest ?? null, email: json.email, available: json.available };
  } catch {
    return { error: GENERIC_ERROR };
  }
}

export function fetchDigest(): Promise<DigestResult> {
  return digestRequest("GET");
}

/** Creates or updates the digest; it goes to the account email. */
export function saveDigest(frequency: DigestFrequency): Promise<DigestResult> {
  return digestRequest("PUT", { frequency });
}

export function deleteDigest(): Promise<DigestResult> {
  return digestRequest("DELETE");
}
