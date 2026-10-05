/** Where to go after signing in: a same-site path only, never another origin. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/^\/(belepes|fiok\/link)(\/|\?|#|$)/.test(value)) return "/";
  return value;
}

/** Pages that work without a session (and that account sync leaves alone). */
export function isAuthPath(pathname: string): boolean {
  return pathname === "/belepes" || pathname.startsWith("/belepes/") || pathname.startsWith("/fiok/link");
}

/** Full page load (not a client navigation): the store and the proxy gate must start fresh. */
export function hardNavigate(path: string): void {
  window.location.href = path;
}
