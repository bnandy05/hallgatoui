const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "msteams:", "discord:"]);

export function normalizeLinkUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The part of a link a person recognises: "canvas.elte.hu", or the scheme for app links. */
export function linkHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.hostname.replace(/^www\./, "") : parsed.protocol.replace(/:$/, "");
  } catch {
    return url;
  }
}
