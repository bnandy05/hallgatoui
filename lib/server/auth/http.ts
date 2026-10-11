import { getAccountStore, type StoredUser } from "@/lib/server/account/store";
import { sendEmail } from "@/lib/server/email";
import { publicAppUrl } from "@/lib/server/appUrl";
import { clientIp, errorResponse, storageErrorResponse } from "@/lib/server/subscription";
import { requestLocale, userLocale } from "@/lib/server/locale";
import { SESSION_TTL_SECONDS } from "@/lib/server/auth/tokens";
import type { Locale } from "@/lib/i18n/locales";
import { sessionUser, type AuthDeps, type AuthError } from "@/lib/server/auth/service";

// Request plumbing shared by the /api/fiok* and /api/adatok routes. Server-only.

export const SESSION_COOKIE = "hr_session";

/** Dependencies for the auth service, or a 503 response when the server has no storage. */
export function authDeps(req: Request): AuthDeps | Response {
  const store = getAccountStore();
  const locale = requestLocale(req);
  if (!store) return errorResponse(locale, "not_configured", 503);
  return { store, send: sendEmail, now: () => new Date(), appUrl: publicAppUrl(req), ip: clientIp(req), locale };
}

/** CSRF defence on top of SameSite: a present Origin must be this site. */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin === null) return null;
  const invalid = () => errorResponse(requestLocale(req), "invalid_request", 403);
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return invalid();
  }
  const own = [req.headers.get("x-forwarded-host"), req.headers.get("host"), new URL(req.url).host];
  return own.some((h) => h && h.split(",")[0].trim() === host) ? null : invalid();
}

/** Parses a JSON body of at most maxBytes, or returns the error response to send. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown | Response> {
  const locale = requestLocale(req);
  if (Number(req.headers.get("content-length")) > maxBytes) return errorResponse(locale, "too_large", 413);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return errorResponse(locale, "bad_request", 400);
  }
  if (Buffer.byteLength(text) > maxBytes) return errorResponse(locale, "too_large", 413);
  try {
    return JSON.parse(text);
  } catch {
    return errorResponse(locale, "bad_request", 400);
  }
}

export function sessionTokenOf(req: Request): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || undefined;
  }
  return undefined;
}

/** The signed-in user (with `deps.locale` set to their account language), or a 401 / 503 response. */
export async function requireUser(
  req: Request
): Promise<{ deps: AuthDeps; user: StoredUser; sessionToken: string } | Response> {
  const deps = authDeps(req);
  if (deps instanceof Response) return deps;
  const sessionToken = sessionTokenOf(req);
  const user = await sessionUser(deps, sessionToken);
  if (!user || !sessionToken) return errorResponse(deps.locale ?? "hu", "not_signed_in", 401);
  return { deps: { ...deps, locale: userLocale(user) }, user, sessionToken };
}

const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

/** Set-Cookie value that starts a session. */
export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure()}`;
}

/** Set-Cookie value that removes the session cookie. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure()}`;
}

/** The service's error in the given language (by its code; the Hungarian text is only a fallback). */
export function authErrorResponse({ error, status, code }: AuthError, locale: Locale = "hu"): Response {
  return code ? errorResponse(locale, code, status) : Response.json({ error }, { status });
}

/** JSON response that is never cached, optionally setting or clearing cookies. */
export function json(body: unknown, cookie?: string | string[], status = 200): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  for (const c of cookie === undefined ? [] : Array.isArray(cookie) ? cookie : [cookie]) headers.append("set-cookie", c);
  return Response.json(body, { status, headers });
}

/** Turns an unexpected storage failure into a 503 instead of an unhandled 500. */
export async function guarded(req: Request, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    console.error("[fiok] storage or server error", err instanceof Error ? err.name : "unknown");
    return storageErrorResponse(requestLocale(req));
  }
}

/** Shared prologue of the POST/PUT/DELETE routes: origin check, deps, small JSON body. */
export async function mutation(
  req: Request,
  maxBytes = 4096
): Promise<{ deps: AuthDeps; body: Record<string, unknown> } | Response> {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const deps = authDeps(req);
  if (deps instanceof Response) return deps;
  const body = await readJson(req, maxBytes);
  if (body instanceof Response) return body;
  return { deps, body: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {} };
}
