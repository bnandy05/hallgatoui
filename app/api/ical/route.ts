import { parseIcs } from "@/lib/ical/parse";
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ical/ssrf";

// POST route handlers are never cached, so there's nothing to opt out of.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "HallgatoiReteg/1.0";

class TooLargeError extends Error {}

function normalizeUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const withScheme = trimmed.toLowerCase().startsWith("webcal://")
    ? `https://${trimmed.slice("webcal://".length)}`
    : trimmed;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Follows up to MAX_REDIRECTS redirects, re-checking assertPublicUrl on every hop. */
async function fetchIcs(initialUrl: URL): Promise<Response> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; ; redirectCount++) {
    await assertPublicUrl(currentUrl);

    const res = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/calendar",
        "user-agent": USER_AGENT,
      },
    });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get("location");
    if (!isRedirect || !location) {
      return res;
    }

    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error("Túl sok átirányítás");
    }

    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
      throw new SsrfBlockedError();
    }
    currentUrl = nextUrl;
  }
}

/** Reads a Response body as text, aborting once it exceeds MAX_BYTES. */
async function readBodyWithLimit(res: Response): Promise<string> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new TooLargeError();
  }

  if (!res.body) {
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new TooLargeError();
    return text;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new TooLargeError();
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

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
