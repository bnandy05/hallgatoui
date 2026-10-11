// The demo: the app with sample data and no account. It is client-only on purpose: nothing is sent
// to the server (no data document, no feed cache, no Redis keys that would outlive the visit).
// `hr_demo` is a session cookie so the proxy lets app pages through without a session; the data
// lives in this tab's sessionStorage and disappears with it.

import { hardNavigate } from "@/lib/account/path";

export const DEMO_COOKIE = "hr_demo";
/** The owner and account id of demo data. Never a real user id (those are random hex). */
export const DEMO_USER_ID = "demo";
/** sessionStorage key of the demo's store cache (the real cache stays in localStorage untouched). */
export const DEMO_CACHE_KEY = "hallgatoireteg-demo";
/** sessionStorage key of the tour's position; present = the tour is open. */
export const DEMO_TOUR_KEY = "hallgatoireteg-demo-tour";

/** True when this browser is in the demo (client only; false on the server). */
export function isDemoMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((part) => part === `${DEMO_COOKIE}=1`);
}

/** Demo feeds carry sample deadlines and a placeholder link: they are never fetched. */
export function isDemoFeedId(feedId: string): boolean {
  return feedId.startsWith("demo-");
}

function safeSession(fn: (s: Storage) => void) {
  try {
    fn(sessionStorage);
  } catch {
    // Private mode or blocked storage: the demo still works, it just starts over on reload.
  }
}

/** Starts the demo (fresh sample data, tour open) with a full page load. */
export function enterDemo(): void {
  document.cookie = `${DEMO_COOKIE}=1; Path=/; SameSite=Lax`;
  safeSession((s) => {
    s.removeItem(DEMO_CACHE_KEY);
    s.setItem(DEMO_TOUR_KEY, "0");
  });
  hardNavigate("/");
}

/** The demo's calls to action: leave it and open the registration form. */
export function registerFromDemo(): void {
  leaveDemo("/belepes?mod=regisztracio");
}

/** Ends the demo and drops its data; the next full page load is the normal, signed-in app. */
export function endDemoMode(): void {
  document.cookie = `${DEMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  safeSession((s) => {
    s.removeItem(DEMO_CACHE_KEY);
    s.removeItem(DEMO_TOUR_KEY);
  });
}

/** Ends the demo and goes to `path` (the sign-in page by default) with a full load. */
export function leaveDemo(path = "/belepes"): void {
  endDemoMode();
  hardNavigate(path);
}
