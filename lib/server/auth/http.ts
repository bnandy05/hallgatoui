import { getAccountStore, type StoredUser } from "@/lib/server/account/store";
import { sendEmail } from "@/lib/server/email";
import { publicAppUrl } from "@/lib/server/appUrl";
import { clientIp, errorResponse, storageErrorResponse } from "@/lib/server/subscription";
import { SESSION_TTL_SECONDS } from "@/lib/server/auth/tokens";
import { sessionUser, type AuthDeps, type AuthError } from "@/lib/server/auth/service";

// Request plumbing shared by the /api/fiok* and /api/adatok routes. Server-only.

export const SESSION_COOKIE = "hr_session";
export const NOT_CONFIGURED = "A fiókok nincsenek beállítva a szerveren";

/** Dependencies for the auth service, or a 503 response when the server has no storage. */
export function authDeps(req: Request): AuthDeps | Response {
  const store = getAccountStore();
  if (!store) return errorResponse(NOT_CONFIGURED, 503);
  return { store, send: sendEmail, now: () => new Date(), appUrl: publicAppUrl(req), ip: clientIp(req) };
}

/** CSRF defence on top of SameSite: a present Origin must be this site. */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (origin === null) return null;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return errorResponse("Érvénytelen kérés", 403);
  }
  const own = [req.headers.get("x-forwarded-host"), req.headers.get("host"), new URL(req.url).host];
  return own.some((h) => h && h.split(",")[0].trim() === host) ? null : errorResponse("Érvénytelen kérés", 403);
}

/** Parses a JSON body of at most maxBytes, or returns the error response to send. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown | Response> {
  if (Number(req.headers.get("content-length")) > maxBytes) return errorResponse("Túl nagy kérés", 413);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return errorResponse("Hibás kérés", 400);
  }
  if (Buffer.byteLength(text) > maxBytes) return errorResponse("Túl nagy kérés", 413);
  try {
    return JSON.parse(text);
  } catch {
    return errorResponse("Hibás kérés", 400);
  }
}

export function sessionTokenOf(req: Request): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || undefined;
  }
  return undefined;
}

/** The signed-in user, or a 401 / 503 response. */
export async function requireUser(
  req: Request
): Promise<{ deps: AuthDeps; user: StoredUser; sessionToken: string } | Response> {
  const deps = authDeps(req);
  if (deps instanceof Response) return deps;
  const sessionToken = sessionTokenOf(req);
  const user = await sessionUser(deps, sessionToken);
  if (!user || !sessionToken) return errorResponse("Nincs bejelentkezve", 401);
  return { deps, user, sessionToken };
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

export function authErrorResponse({ error, status }: AuthError): Response {
  return errorResponse(error, status);
}

/** JSON response that is never cached, optionally setting or clearing the session cookie. */
export function json(body: unknown, cookie?: string, status = 200): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return Response.json(body, { status, headers });
}

/** Turns an unexpected storage failure into a 503 instead of an unhandled 500. */
export async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    console.error("[fiok] storage or server error", err instanceof Error ? err.name : "unknown");
    return storageErrorResponse();
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
