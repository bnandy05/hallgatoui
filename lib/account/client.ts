import { currentMessages } from "@/lib/i18n/clientLocale";
import { hardNavigate } from "@/lib/account/path";
import { useStore } from "@/lib/store";
import { clearOfflineCache } from "@/lib/sw";
import { offsetFromResponse, setServerOffset } from "@/lib/sync/clock";
import type { SyncPayload } from "@/lib/sync/merge";

// Fetch wrappers for /api/fiok* and /api/adatok. They never throw: errors come back as
// messages in the UI language (the server localizes its own; the generic ones are here),
// like lib/subscription/client.ts.

const genericError = () => currentMessages().errors.generic;
const networkError = () => currentMessages().errors.network;

export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : T)) | { ok: false; error: string; status: number; code?: string };

/** Records how far this device's clock is from the server's (the `Date` header of a good response). */
function learnServerClock(res: Response, sentAt: number) {
  const offset = offsetFromResponse(res.headers.get("date"), sentAt, Date.now());
  if (offset === null) return;
  setServerOffset(offset);
  // The persisted copy only changes when the clock moved noticeably, so requests don't rewrite the cache.
  if (Math.abs(offset - useStore.getState().serverOffsetMs) > 2000) useStore.getState().setServerOffsetMs(offset);
}

async function call(path: string, method: string, body?: unknown): Promise<Response | null> {
  try {
    const sentAt = Date.now();
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) learnServerClock(res, sentAt);
    return res;
  } catch {
    return null;
  }
}

async function errorOf(res: Response | null): Promise<{ ok: false; error: string; status: number; code?: string }> {
  if (!res) return { ok: false, error: networkError(), status: 0 };
  try {
    const json = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof json.error === "string") {
      return { ok: false, error: json.error, status: res.status, code: typeof json.code === "string" ? json.code : undefined };
    }
  } catch {
    // Not JSON.
  }
  return { ok: false, error: genericError(), status: res.status };
}

/** A request whose success body we don't need. */
async function simple(path: string, method: string, body?: unknown): Promise<Result> {
  const res = await call(path, method, body);
  return res?.ok ? { ok: true } : errorOf(res);
}

export interface AccountUser {
  id: string;
  email: string;
  hasPassword: boolean;
}

export async function fetchMe(): Promise<Result<{ user: AccountUser }>> {
  const res = await call("/api/fiok", "GET");
  if (!res?.ok) return errorOf(res);
  try {
    const json = (await res.json()) as { user?: AccountUser };
    if (json.user && typeof json.user.id === "string" && typeof json.user.email === "string") {
      return { ok: true, user: json.user };
    }
  } catch {
    // Fall through.
  }
  return { ok: false, error: genericError(), status: res.status };
}

export const register = (email: string, password: string) => simple("/api/fiok/regisztracio", "POST", { email, password });
export const login = (email: string, password: string) => simple("/api/fiok/belepes", "POST", { email, password });
export const requestMagicLink = (email: string) => simple("/api/fiok/link", "POST", { email });
export const requestPasswordReset = (email: string) => simple("/api/fiok/jelszo-emlekezteto", "POST", { email });
export const consumeLink = (kind: string, token: string, password?: string) =>
  simple("/api/fiok/link/hasznal", "POST", { m: kind, t: token, password });
export const changePassword = (current: string | undefined, next: string) =>
  simple("/api/fiok/jelszo", "PUT", { current, next });
export const changeEmail = (email: string) => simple("/api/fiok/email", "PUT", { email });
/** Saves the language as the account's own choice (mails and the subscribed calendar follow). */
export const setAccountLanguage = (locale: string) => simple("/api/fiok/nyelv", "PUT", { locale });

/**
 * Right after a sign-in: if this browser's cache belongs to someone else, drop it before any page
 * can show it. Called by the sign-in forms before they navigate on.
 */
export async function dropForeignCache(): Promise<void> {
  const me = await fetchMe();
  if (!me.ok) return;
  const state = useStore.getState();
  if (state.ownerUserId && state.ownerUserId !== me.user.id) state.clearAccountData();
}

/** Ends this session (or all of them), then clears the local data. Returns an error or null. */
export async function signOut(everywhere: boolean): Promise<string | null> {
  const res = await call(`/api/fiok/kilepes${everywhere ? "?mindenhol=1" : ""}`, "POST");
  if (!res?.ok) return (await errorOf(res)).error;
  useStore.getState().clearAccountData();
  clearOfflineCache();
  hardNavigate("/belepes");
  return null;
}

export async function deleteAccount(email: string): Promise<string | null> {
  const res = await call("/api/fiok", "DELETE", { email });
  if (!res?.ok) return (await errorOf(res)).error;
  useStore.getState().clearAccountData();
  clearOfflineCache();
  hardNavigate("/belepes");
  return null;
}

// ---- data document ----

export type PullResult =
  | { kind: "unchanged"; version: number }
  | { kind: "data"; version: number; payload: SyncPayload }
  | { kind: "unauthorized" }
  | { kind: "failed"; offline: boolean; error: string };

export type PushResult =
  | { kind: "ok"; version: number }
  | { kind: "conflict"; version: number; payload: SyncPayload }
  | { kind: "unauthorized" }
  | { kind: "failed"; offline: boolean; error: string; retry: boolean };

function isPayload(json: unknown): json is { version: number; data: SyncPayload["data"]; exportOptions: SyncPayload["exportOptions"] } {
  const j = json as { version?: unknown; data?: unknown; exportOptions?: unknown } | null;
  return !!j && typeof j.version === "number" && !!j.data && typeof j.data === "object" && !!j.exportOptions;
}

export async function pullData(since?: number): Promise<PullResult> {
  const res = await call(since === undefined ? "/api/adatok" : `/api/adatok?since=${since}`, "GET");
  if (!res) return { kind: "failed", offline: true, error: networkError() };
  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) return { kind: "failed", offline: res.status >= 500, error: (await errorOf(res)).error };
  const json = (await res.json().catch(() => null)) as unknown;
  if (json && typeof json === "object" && (json as { unchanged?: unknown }).unchanged === true) {
    return { kind: "unchanged", version: Number((json as { version?: unknown }).version) };
  }
  if (!isPayload(json)) return { kind: "failed", offline: false, error: genericError() };
  return { kind: "data", version: json.version, payload: { data: json.data, exportOptions: json.exportOptions } };
}

export async function pushData(baseVersion: number, payload: SyncPayload): Promise<PushResult> {
  const res = await call("/api/adatok", "PUT", { baseVersion, data: payload.data, exportOptions: payload.exportOptions });
  if (!res) return { kind: "failed", offline: true, error: networkError(), retry: true };
  if (res.status === 401) return { kind: "unauthorized" };
  if (res.status === 409) {
    const json = (await res.json().catch(() => null)) as unknown;
    if (isPayload(json)) {
      return { kind: "conflict", version: json.version, payload: { data: json.data, exportOptions: json.exportOptions } };
    }
    return { kind: "failed", offline: false, error: genericError(), retry: true };
  }
  if (!res.ok) {
    const err = await errorOf(res);
    // 5xx (storage hiccup): retry. 400/413 will not get better by retrying.
    return { kind: "failed", offline: res.status >= 500, error: err.error, retry: res.status >= 500 || res.status === 429 };
  }
  const json = (await res.json().catch(() => null)) as { version?: unknown } | null;
  return typeof json?.version === "number"
    ? { kind: "ok", version: json.version }
    : { kind: "failed", offline: false, error: genericError(), retry: true };
}
