import { parseIcs } from "@/lib/ical/parse";
import { fetchIcs, normalizeUrl, readBodyWithLimit } from "@/lib/ical/fetch";
import { IcalError } from "@/lib/ical/errors";
import { getMessages, type Locale } from "@/lib/i18n";
import { requestLocale } from "@/lib/server/locale";

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

export async function POST(req: Request): Promise<Response> {
  const locale = requestLocale(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(locale, new IcalError("bad_url"));
  }

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
