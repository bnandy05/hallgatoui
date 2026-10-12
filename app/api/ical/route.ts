import { parseIcs } from "@/lib/ical/parse";
import { fetchIcs, normalizeUrl, readBodyWithLimit } from "@/lib/ical/fetch";
import { IcalError } from "@/lib/ical/errors";
import { getMessages, type Locale } from "@/lib/i18n";
import { checkOrigin, guarded, readJson, requireUser } from "@/lib/server/auth/http";
import { errorResponse } from "@/lib/server/subscription";

// Signed-in users only (it is a fetch proxy), same-origin, and rate limited per user.
// Callers (lib/ical/client.ts): one stale-only sync of all feeds when the app opens (at most
// MAX_FEEDS = 20), manual "refresh all" / single refresh, timetable re-import by link, and adding a
// feed. Even refreshing 20 feeds twice stays under the limit.
const FETCH_LIMIT = 60; // fetches per user...
const FETCH_WINDOW_SECONDS = 10 * 60; // ...per 10 minutes

// POST route handlers are never cached, so there's nothing to opt out of.

/** An IcalError code as the response status and the code used in the dictionaries. */
const STATUS: Record<IcalError["code"], number> = {
  bad_url: 400,
  blocked: 400,
  unreachable: 502,
  http: 502,
  too_large: 413,
  format: 422,
  redirects: 502,
};

function fail(locale: Locale, error: IcalError): Response {
  const base = getMessages(locale).errors[`ical_${error.code}` as const];
  const message = error.code === "http" && error.status ? `${base} (HTTP ${error.status})` : base;
  return Response.json({ error: message, code: `ical_${error.code}` }, { status: STATUS[error.code] });
}

export function POST(req: Request): Promise<Response> {
  return guarded(req, () => handle(req));
}

async function handle(req: Request): Promise<Response> {
  const bad = checkOrigin(req);
  if (bad) return bad;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const locale = auth.deps.locale ?? "hu";
  if ((await auth.deps.store.kv.incr(`rl:ical:${auth.user.id}`, FETCH_WINDOW_SECONDS)) > FETCH_LIMIT) {
    return errorResponse(locale, "rate_limited", 429);
  }
  const body = await readJson(req, 4096);
  if (body instanceof Response) return body;

  const rawUrl =
    body && typeof body === "object" && "url" in body && typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url
      : null;

  const url = rawUrl ? normalizeUrl(rawUrl) : null;
  if (!url) return fail(locale, new IcalError("bad_url"));

  let res: Response;
  try {
    res = await fetchIcs(url);
  } catch (err) {
    return fail(locale, err instanceof IcalError ? err : new IcalError("unreachable"));
  }

  if (!res.ok) return fail(locale, new IcalError("http", res.status));

  let text: string;
  try {
    text = await readBodyWithLimit(res);
  } catch (err) {
    return fail(locale, err instanceof IcalError ? err : new IcalError("unreachable"));
  }

  try {
    const events = parseIcs(text, getMessages(locale).labels.untitled);
    return Response.json({ events });
  } catch {
    return fail(locale, new IcalError("format"));
  }
}
