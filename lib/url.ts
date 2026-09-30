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
