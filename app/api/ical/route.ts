import { parseIcs } from "@/lib/ical/parse";
import { fetchIcs, normalizeUrl, readBodyWithLimit, TooLargeError } from "@/lib/ical/fetch";
import { SsrfBlockedError } from "@/lib/ical/ssrf";

// POST route handlers are never cached, so there's nothing to opt out of.

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Hiányzó vagy hibás URL" }, { status: 400 });
  }

  const rawUrl =
    body && typeof body === "object" && "url" in body && typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url
      : null;

  if (!rawUrl) {
    return Response.json({ error: "Hiányzó vagy hibás URL" }, { status: 400 });
  }

  const url = normalizeUrl(rawUrl);
  if (!url) {
    return Response.json({ error: "Hiányzó vagy hibás URL" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetchIcs(url);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return Response.json({ error: "Nem engedélyezett cím" }, { status: 400 });
    }
    return Response.json({ error: "A naptár nem érhető el" }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json(
      { error: `A naptár nem tölthető le (HTTP ${res.status})` },
      { status: 502 }
    );
  }

  let text: string;
  try {
    text = await readBodyWithLimit(res);
  } catch (err) {
    if (err instanceof TooLargeError) {
      return Response.json({ error: "Túl nagy naptárfájl" }, { status: 413 });
    }
    return Response.json({ error: "A naptár nem érhető el" }, { status: 502 });
  }

  try {
    const events = parseIcs(text);
    return Response.json({ events });
  } catch {
    return Response.json({ error: "Hibás iCal formátum" }, { status: 422 });
  }
}
