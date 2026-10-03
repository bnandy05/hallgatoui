/** Prefix of the restructured app (week-board layout), served in parallel to the original routes. */
export const NEW_LAYOUT_BASE = "/uj";

export function isNewLayout(pathname: string): boolean {
  return pathname === NEW_LAYOUT_BASE || pathname.startsWith(`${NEW_LAYOUT_BASE}/`);
}

/** Maps an internal route ("/radar", "/targy/x#y") into the layout the visitor is currently using. */
export function routeFor(pathname: string, href: string): string {
  if (!isNewLayout(pathname) || !href.startsWith("/") || isNewLayout(href)) return href;
  return href === "/" ? NEW_LAYOUT_BASE : `${NEW_LAYOUT_BASE}${href}`;
}
