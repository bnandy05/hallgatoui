import { parseIcs } from "@/lib/ical/parse";
import type { IcalEventDTO } from "@/lib/ical/types";
import { IcalError } from "@/lib/ical/errors";
import { assertPublicUrl, SsrfBlockedError } from "@/lib/ical/ssrf";

// Server-only: shared by the /api/ical proxy and the calendar subscription route.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REDIRECTS = 3;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "HallgatoiReteg/1.0";

export class TooLargeError extends IcalError {
  constructor() {
    super("too_large");
  }
}

export function normalizeUrl(rawUrl: string): URL | null {
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
export async function fetchIcs(
  initialUrl: URL,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; ; redirectCount++) {
    await assertPublicUrl(currentUrl);

    const res = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
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
      throw new IcalError("redirects");
    }

    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
      throw new SsrfBlockedError();
    }
    currentUrl = nextUrl;
  }
}

/** Reads a Response body as text, aborting once it exceeds MAX_BYTES. */
export async function readBodyWithLimit(res: Response): Promise<string> {
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

/** Fetches and parses a feed; throws an IcalError (with a code to localize) on any failure. */
export async function fetchAndParseFeed(
  rawUrl: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  untitled?: string
): Promise<IcalEventDTO[]> {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new IcalError("bad_url");

  let res: Response;
  try {
    res = await fetchIcs(url, timeoutMs);
  } catch (err) {
    if (err instanceof IcalError) throw err;
    throw new IcalError("unreachable");
  }
  if (!res.ok) throw new IcalError("http", res.status);

  let text: string;
  try {
    text = await readBodyWithLimit(res);
  } catch (err) {
    if (err instanceof IcalError) throw err;
    throw new IcalError("unreachable");
  }

  try {
    return parseIcs(text, untitled);
  } catch {
    throw new IcalError("format");
  }
}
