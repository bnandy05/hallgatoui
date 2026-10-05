/** Tells the service worker to drop its cached app pages (sign-out, account deletion). Best effort. */
export function clearOfflineCache(): void {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.controller?.postMessage({ type: "clear" });
  } catch {
    // No service worker: nothing to clear.
  }
}
