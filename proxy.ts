import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: app pages need a session cookie, otherwise the visitor goes to /belepes. It
// only checks that the cookie exists; the API is the real gate (401), and the client handles that.
export function proxy(request: NextRequest) {
  if (request.cookies.has("hr_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  const back = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/belepes";
  url.search = back === "/" ? "" : `?vissza=${encodeURIComponent(back)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the API, Next internals, files with an extension (sw.js, manifest.webmanifest), generated icons, and the public pages.
  matcher: ["/((?!api|_next|belepes|fiok/link|hirlevel|icon|apple-icon|.*\\..*).*)"],
};
