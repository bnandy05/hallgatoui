# Offline editing and deadline series

Two features, three phases. Each phase is implemented by one coder, then reviewed before the next.
Conventions: `CLAUDE.md`. All UI text Hungarian, code English. No new dependencies. The coder runs
`npm test && npm run lint && npm run build` at the end of the phase and does **not** commit.

## Where we start

- `lib/sync/engine.ts` already keeps edits in the zustand store, persisted to localStorage
  (`account`, `ownerUserId`, `syncBase`, `syncedVersion` are persisted too), and pushes them when it
  can. A 409 runs `mergeAppData` (`lib/sync/merge.ts`): three-way per list by id, but an item changed
  on **both** sides takes the **remote** copy whole, and delete-vs-edit is inconsistent (local delete
  + remote edit keeps the item; remote delete + local edit drops it).
- With no network the app can't even open: there is no service worker, so a reload or a cold start
  of the phone browser fails before any JS runs.

## Goals

1. Edits made on a phone with no data are kept, survive reloads and closing the browser, and are
   uploaded when the connection returns, without asking.
2. No edit is lost to a conflict. When two devices changed **different fields** of the same item,
   both changes are kept. When they changed the **same field**, the later change wins (by time of
   the edit, not by who uploaded first). Delete vs edit: the later action wins.
3. The app opens offline (installed to the home screen or in the browser) from cache.
4. A manual deadline can be created on several dates at once, or as a recurring series (every N days
   or weeks, a number of times or until a date), e.g. weekly quizzes that aren't on Canvas.

---

## Phase 1: "latest change wins" merge (pure, tested)

### Data model (`lib/types.ts`)

- Add `updatedAt?: string` (ISO) to `Course`, `Deadline`, `Platform` (custom), `IcalFeed`,
  `TimetableSource`, `CourseLink`, `Resource`. Optional so old documents stay valid; a missing
  `updatedAt` counts as the oldest possible time.
- Add to `AppData`: `tombstones?: Record<string, string>` — item id → ISO time of deletion, for
  courses, deadlines, custom platforms, feeds, timetable sources, and links/resources (their ids are
  unique too). Not for `classSessions` (imports regenerate them; the plain three-way rule is enough).
  `parseAppData` (`lib/importData.ts`) defaults it to `{}` and drops non-string values; check that
  `updatedAt`/`seriesId` (phase 3) pass through `parseAppData`/`sanitizeUrls`/`validateAppData`
  untouched (they spread items today; keep it that way). `emptyAppData()` gets `tombstones: {}`.
- Pruning: a pure `pruneTombstones(t, now)` drops entries older than 60 days and keeps at most the
  newest 5000. Call it when building the payload to push (or in `mergeAppData`'s output) so the
  document can't grow without bound.

### Clock (`lib/sync/clock.ts`, new, pure-ish, no React)

- Device clocks drift; a phone set 10 minutes fast would always win. Keep a module-level
  `serverOffsetMs` (persist it in the store as a device value, not in `AppData`), updated from the
  `Date` response header of every successful `/api/fiok` and `/api/adatok` response in
  `lib/account/client.ts` (offset = server date − local midpoint of the request; ignore if the header
  is missing; header resolution is 1 s, that's fine).
- `syncNow(): string` = `new Date(Date.now() + serverOffsetMs).toISOString()`. Every timestamp below
  uses it.

### Stamping (`lib/store.ts`)

- Every store action that creates or changes an item of the synced lists sets `updatedAt: syncNow()`
  on exactly the items it changes (including group followers in `updateDeadline`/`toggleDone`,
  `applyFeedSync`'s upserted deadlines **only when something actually changed**, course link/resource
  edits on both the resource and its course, `updateFeed`, `applyDiscovery`, timetable sources).
  Write a small helper (`touch(item)`) rather than repeating the literal.
- Every action that removes items records a tombstone for each removed id
  (`removeDeadline`, `removeCourse` and whatever it cascades to, `removeFeed` and its deadlines,
  `removeCustomPlatform`, timetable source removal, link/resource removal, `clearAccountData` does
  **not** — that's a local reset). `importData` (JSON import replacing everything) records
  tombstones for the ids it drops.
- `applyServerData`/`applyMerged` take tombstones from the payload as-is.

### Merge (`lib/sync/merge.ts`)

Rewrite `mergeById` as a field-level, time-aware three-way merge. For each id in base ∪ local ∪
remote, with `b`, `l`, `r` (any may be missing), `t(x)` = `x.updatedAt` or `""`, and `T` = merged
tombstones (union of both sides, keep the later time per id):

| case | result |
| --- | --- |
| only in `l` (not in `b`, not in `r`) | keep `l`, unless `T[id]` is later than `t(l)` (deleted elsewhere after) |
| only in `r` | keep `r`, same tombstone check |
| in `l` and `r`, not in `b` (added on both, e.g. same id) | field merge with no base: per field, the newer side's value |
| in `b`, missing in `l` (deleted locally), in `r` | if `r` unchanged vs `b` → gone; else keep `r` only if `t(r)` > `T[id]` |
| in `b`, in `l`, missing in `r` (deleted remotely) | if `l` unchanged vs `b` → gone; else keep `l` only if `t(l)` > `T[id]` |
| in `b`, missing in both | gone |
| in all three | per field: changed on one side → that side; changed on both to different values → the side with the later `updatedAt` (tie → remote); merged `updatedAt` = max |

- For courses, the `links` and `resources` fields are merged recursively with the same function
  (they're id-keyed lists), not as opaque values. Everything else is compared by `stableStringify`.
- Order: remote order, then local-only additions in local order (as today).
- `ignoredDuplicatePairs`: keep `mergeSet`.
- `exportOptions`: keep `mergeOptions` (same option changed on two devices offline is not worth
  per-option timestamps; note it in a comment).
- **iCal duplicates after merge.** Two devices that both synced a feed while out of step create the
  same feed event under two random ids. After merging `deadlines`, collapse deadlines with the same
  `(feedId, externalUid)`: keep the remote one's id, and take `done`/`critical`/`courseId` from
  whichever copy has the later `updatedAt`; tombstone the dropped id. Pure helper, tested.
- `mergeAppData` returns the merged tombstones in `data.tombstones`, pruned.

### Tests (`test/merge.test.ts`, extend; `test/clock.test.ts` if it has pure parts)

Cover at least: different fields of one deadline changed on two devices → both kept; same field →
later wins regardless of which side is local; tie → remote; offline delete (later) beats earlier
remote edit; remote edit later than local delete → item comes back; local-only add kept; added on
both with same id; nested link edit on one side + course rename on the other; iCal duplicate
collapse keeps the later `done`; tombstone pruning (age and cap); legacy items without `updatedAt`.
Keep the existing merge tests passing (update their expectations only where the old "remote wins
whole item" rule is intentionally replaced, and say which in the report).

---

## Phase 2: the app works offline

### Service worker (`public/sw.js`, hand-written, no Workbox)

Read `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` first (headers for
`sw.js`, registration).

- One cache name with a version constant, e.g. `hr-v1` (pages) and `hr-static-v1` (assets);
  `activate` deletes other `hr-*` caches and calls `clients.claim()`; `install` calls `skipWaiting()`
  and precaches `/`, `/radar`, `/beallitasok` (ignore failures, e.g. not signed in).
- `fetch` handler, GET only, same origin only:
  - `/api/*`: not handled (straight to the network; never cached).
  - `/_next/static/*` and the font/icon files: cache-first, then network and store. Cap the static
    cache (e.g. 400 entries, drop the oldest) so deploys don't pile up.
  - Navigations (`request.mode === "navigate"`) to app routes (`/`, `/radar`, `/beallitasok`,
    `/targy/*`): network-first with a ~4 s timeout. Store a fresh copy only when
    `response.ok && !response.redirected && response.type === "basic"` (so the `/belepes` redirect is
    never cached as an app page). On failure/timeout: the cached copy of that exact URL, else the
    cached `/` (the client router then renders the right route from the URL only if the page shell
    allows it; if `/targy/<id>` can't be served correctly from `/`, cache visited `/targy/*` URLs and
    fall back to `/` — verify which works and document it in the SW).
  - RSC/soft-navigation fetches (`RSC: 1` header or `_rsc` param): network only; when it fails Next
    falls back to a full navigation, which the navigation handler then serves from cache. Verify this
    with `next build && next start` + DevTools offline.
  - Auth pages (`/belepes`, `/fiok/*`, `/hirlevel`): network only.
- A message `{ type: "clear" }` deletes the page cache (used on sign-out).

### Registration and install

- `components/ServiceWorkerRegister.tsx` (client, renders nothing), mounted in `AppShell`: registers
  `/sw.js` only in production (`process.env.NODE_ENV === "production"`) and only when
  `"serviceWorker" in navigator`.
- `next.config.ts`: headers for `/sw.js` (`Cache-Control: no-cache, no-store, must-revalidate`,
  `Content-Type: application/javascript; charset=utf-8`, CSP `default-src 'self'; script-src 'self'`)
  as in the guide. Also make sure `proxy.ts`'s matcher skips `/sw.js` and the manifest/icons (the
  `.*\..*` rule probably covers them; check `manifest.webmanifest`).
- `app/manifest.ts`: name "Hallgatói réteg", short name "Hallgatói", `start_url: "/"`,
  `display: "standalone"`, background/theme colours from the light tokens (`THEME_COLOR` in
  `lib/theme.ts`). Icons via `app/icon.tsx` and `app/apple-icon.tsx` (`ImageResponse` from
  `next/og`, built in) drawing the existing notebook logo mark — no new image dependencies.
- Sign-out: wherever the client signs out (find it: it calls `flushSync()`), post `{ type: "clear" }`
  to the active service worker after flushing.

### Sync engine (`lib/sync/engine.ts`)

- When the page becomes visible or gets focus and the engine hasn't `started` (it was opened
  offline), call `start()` (phones often don't fire `online` for a page that was frozen). Clear a
  pending retry timer first, like `onOnline`.
- Push on hide: on `visibilitychange` → hidden and `pagehide`, if dirty, call `flush()` immediately
  (skip the debounce). Data is in localStorage anyway; this just uploads sooner.
- Offline start must not touch the data: with a persisted `account` and `ownerUserId`, the cache
  stays readable (`useDataReady` already allows it) and edits stay `dirty` against the persisted
  `syncBase`. Verify the resume branch merges (not overwrites) when the server moved on meanwhile.

### Feeds offline (`lib/ical/client.ts`)

- A network failure (fetch threw, or `navigator.onLine === false`) must not write `lastError` onto the
  feed (that's a synced change and would show a false error on every device). Skip the sync quietly;
  only real server/parse errors set `lastError`. Don't auto-sync feeds while offline at all.

### UI (`components/SyncStatus.tsx`)

- Offline copy: "Offline – a módosítások ezen az eszközön megmaradnak, és feltöltjük őket, amint
  újra van kapcsolat." Keep it short in the compact spot, full text in the title/tooltip. When back
  and saved, the usual state. Tone: not "bad" red for offline with pending edits — use the muted/
  canary tone; red stays for real errors.

### Verify

`next build && next start`, sign in, open `/`, `/radar`, a course page; DevTools → Offline; reload
each route (opens from cache), add and tick a deadline, reload again (edits still there), go online
(edits uploaded, status idle). Simulate a conflict: second browser profile edits the same deadline's
title while the first ticks it offline → both kept. Report what was verified.

---

## Phase 3: deadlines on several dates / recurring

Only when **creating** a manual deadline (the edit form stays single).

### Model

- `Deadline.seriesId?: string` — shared by the deadlines created together. Purely informational for
  the UI; dedupe/export/radar treat them as normal manual deadlines.

### Pure logic (`lib/recurrence.ts`, tested in `test/recurrence.test.ts`)

```ts
export type RepeatSpec =
  | { kind: "once" }
  | { kind: "dates"; extra: Date[] } // besides the main due
  | { kind: "every"; interval: number; unit: "day" | "week"; end: { count: number } | { until: Date } };

export const MAX_SERIES = 30;
export function expandDueDates(first: Date, spec: RepeatSpec): Date[]; // sorted, deduped by minute, capped at MAX_SERIES, first included
export function seriesTitles(title: string, n: number): string[];       // "Kvíz" → "Kvíz 1".."Kvíz n"; "Kvíz 3" → "Kvíz 3".."Kvíz n+2"
```

- Weekly/daily steps keep the local wall-clock time across the DST change (`addDays`/`addWeeks` from
  date-fns on local dates). `until` is inclusive (the whole day). `interval` 1–52, `count` 1–30.

### Store

- `addDeadlines(items: DeadlineFormValues[]): string[]` — one `set()` (one sync), new `seriesId` when
  more than one, each stamped with `updatedAt`.
- `removeDeadlines(ids: string[])` — one `set()`, tombstones for all.

### Form (`components/DeadlineForm.tsx`)

Below the Határidő field, only when `!initial`: a segmented control (build from `components/ui/*`;
check for an existing segmented/tab primitive first) **Egyszer · Több időpont · Ismétlődő**.

- **Több időpont:** a list of extra `datetime-local` inputs (the main Határidő is the first),
  "Időpont hozzáadása" (adds one a week after the last), remove buttons per row.
- **Ismétlődő:** "Minden [1] [hét ▾]" (hét / nap), and the end: "[6] alkalom" or "eddig: [date]"
  (two-option toggle).
- When it makes more than one: a checkbox "Sorszám a cím végére" (default on) and a preview line:
  "6 határidő: okt. 7., okt. 14., okt. 21., … dec. 9." (date-fns `hu`), plus a hint when the cap cut
  the list ("legfeljebb 30").
- Submit → `onSubmit` receives a list (change `DeadlineFormProps.onSubmit` to
  `(values: DeadlineFormValues[]) => void`, single-item for edit), `DeadlineDialog` calls
  `addDeadlines` / `updateDeadline`.
- Mobile: the form is a bottom sheet already; keep inputs 16px on touch, nothing horizontal-scrolls.

### Series in the detail dialog (`components/DeadlineItem.tsx`, `DeadlineDetailDialog`)

- If the deadline has a `seriesId` and other deadlines share it, show "Sorozat: 3/6" next to the
  meta, and on delete offer a choice instead of plain `confirm()`: **Csak ezt** / **Ezt és a
  későbbieket** (later = same series, due ≥ this one's due) / Mégse, in a small `Dialog`.

### Verify

Create "Kvíz" every week ×6 for a course → six numbered slips on the right weeks, same time of day
across the late-October DST change; "Több időpont" with 3 dates; delete "ezt és a későbbieket" from
the 4th → 3 remain; everything syncs (one save).

---

## After all phases

Update `CLAUDE.md` (sync: field-level, latest-wins, tombstones, `syncNow`; offline: service worker in
`public/sw.js`, what it caches; recurrence in `lib/recurrence.ts`, `seriesId`) and `docs/PLAN.md`
(Done list). The owner tests on the phone (airplane mode) and commits.
