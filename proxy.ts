import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/account/path";
import { DEMO_COOKIE } from "@/lib/demoMode";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, pickLocale } from "@/lib/i18n/locales";

// Two jobs. Language: a visitor without a valid hr_lang cookie gets one from Accept-Language (on
// public pages too). Gate: app pages need a session cookie, otherwise the visitor goes to /belepes.
// It only checks that the cookie exists; the API is the real gate (401), and the client handles that.
// The demo (hr_demo, lib/demoMode.ts) opens the app pages too; it never calls the API. Signing in ends
// it (dropForeignCache); a leftover session cookie must not, since it may be long expired.
export function proxy(request: NextRequest) {
  const needsLocale = !isLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const inDemo = request.cookies.get(DEMO_COOKIE)?.value === "1";
  let response: NextResponse;
  if (request.cookies.has("hr_session") || inDemo || isPublicPath(request.nextUrl.pathname)) {
    response = NextResponse.next();
  } else {
    const url = request.nextUrl.clone();
    const back = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/belepes";
    url.search = back === "/" ? "" : `?vissza=${encodeURIComponent(back)}`;
    response = NextResponse.redirect(url);
  }
  if (needsLocale) {
    response.cookies.set({
      name: LOCALE_COOKIE,
      value: pickLocale(request.headers.get("accept-language")),
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
    });
  }
  return response;
}

export const config = {
  // Everything except the API, Next internals, files with an extension (sw.js, manifest.webmanifest) and generated icons.
  // Public pages are matched too (they need the language cookie); the gate skips them via isPublicPath.
  matcher: ["/((?!api|_next|icon|apple-icon|.*\\..*).*)"],
};
