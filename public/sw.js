// Hallgatói réteg service worker: lets the app open without a connection. Hand-written, no library.
//
// - /api/* and everything that is not a plain GET to our own origin: not handled (network only).
// - /_next/static/*, icons: cache-first (hr-static-*, capped, oldest dropped).
// - Navigations to app pages (/, /radar, /beallitasok, /targy/*): network-first with a timeout; only
//   a plain 200 (never a redirect such as the /belepes one) is stored. Offline: the cached copy of that
//   exact path, else the cached "/". A cached "/" opened on /targy/<id> shows the home board until
//   the router corrects it, so every visited /targy/* page is cached under its own path.
// - Soft navigations (RSC fetches) are not handled: when they fail, Next falls back to a full
//   navigation, which is served here from the cache.
// - Auth pages (/belepes, /fiok/*, /hirlevel): network only.
// - Message { type: "clear" } deletes the page cache (sent on sign-out and when the language is switched, since pages differ per language).

const VERSION = "v2";
const PAGES = `hr-pages-${VERSION}`;
const STATIC = `hr-static-${VERSION}`;
const PRECACHE = ["/", "/radar", "/beallitasok"];
const NETWORK_TIMEOUT_MS = 4000;
const STATIC_LIMIT = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      await Promise.all(
        PRECACHE.map(async (path) => {
          try {
            const res = await fetch(path, { credentials: "same-origin" });
            if (isStorable(res)) {
              await cache.put(path, res.clone());
              await cacheAssetsOf(res);
            }
          } catch {
            // Offline or not signed in: nothing to precache.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC]);
      for (const key of await caches.keys()) {
        if (key.startsWith("hr-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear") {
    event.waitUntil(caches.delete(PAGES));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith("/api/")) return;

  if (path.startsWith("/_next/static/") || path === "/icon" || path.startsWith("/icon/") || path.startsWith("/apple-icon")) {
    event.respondWith(staticAsset(request));
    return;
  }

  if (request.mode === "navigate" && isAppPage(path)) {
    event.respondWith(appPage(event, url));
  }
});

function isAppPage(path) {
  return path === "/" || path === "/radar" || path === "/beallitasok" || path.startsWith("/targy/");
}

function isStorable(res) {
  return res.ok && !res.redirected && res.type === "basic";
}

/** Pages are stored per path: the query string (and a trailing slash) does not make a new entry. */
function pageKey(url) {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return new Request(url.origin + path);
}

async function appPage(event, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  const network = fetch(event.request).then(async (res) => {
    if (isStorable(res)) {
      await cache.put(key, res.clone());
      await cacheAssetsOf(res);
    }
    return res;
  });
  // Keep the worker alive so a slow response still refreshes the cache.
  event.waitUntil(network.catch(() => {}));

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // Offline: fall through to the cache.
  } finally {
    clearTimeout(timer);
  }
  return (await cache.match(key)) || (await cache.match(new Request(url.origin + "/"))) || network;
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    await cache.put(request, res.clone());
    await trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_LIMIT; i++) await cache.delete(keys[i]);
}

/** Stores the scripts, styles and fonts a page refers to, so it also opens offline on a first visit. */
async function cacheAssetsOf(res) {
  try {
    const html = await res.clone().text();
    const found = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) || []);
    const cache = await caches.open(STATIC);
    await Promise.all(
      [...found].map(async (asset) => {
        if (await cache.match(asset)) return;
        try {
          const r = await fetch(asset);
          if (r.ok && r.type === "basic") await cache.put(asset, r);
        } catch {
          // Best effort.
        }
      }),
    );
    await trim(cache);
  } catch {
    // Best effort.
  }
}
