# Accounts and server-held data (part 1)

Status: approved in chat 2026-10-05. Part 2 (Google and Apple sign-in) is a separate spec.

## Why

Today all data lives in one browser's localStorage, and the calendar subscription and email digest hang off a `token`/`secret` pair that only that browser holds. Importing a JSON backup, using a second device or clearing site data loses the link to the server records: the calendar stops following the data, and the digest can't be managed. Accounts make the server the single source of truth, and the subscription and digest belong to the account.

## Decisions

- **Sign-in is required.** No guest mode. Signed out, app routes redirect to `/belepes`. The `.ics` URL, `/hirlevel` and the email link pages stay public.
- **Methods (part 1):** email + password, and passwordless "magic link". Email must be confirmed before the account can be used (a magic link counts as confirmation).
- **Server is the source of truth.** One data document per user, with a version number. The zustand store stays the in-memory model; localStorage is a cache.
- **Hand-rolled auth on Node built-ins** (`node:crypto` scrypt, randomBytes, sha256), behind an `AccountStore` interface so storage can move from Redis to Postgres or anything else without touching routes or UI. No new dependencies in part 1.
- **No migration of existing users** (there are two). Existing subscriptions and digests are abandoned; users can export JSON before and import after signing in. If an account's data is empty and the browser's cache holds data, the client uploads it once.
- **Data:** `{ data: AppData, exportOptions: ExportOptions }`, capped at 900 KB serialized (below the Upstash request limit).

## Storage: `AccountStore`

`lib/server/account/store.ts` declares the interface; `memoryStore.ts` (dev without Redis, and tests) and `redisStore.ts` (Upstash, same env vars as `lib/server/kv.ts`) implement it. `getAccountStore()` returns null in production without storage (routes answer 503), like `getKv()`.

Records (Redis key → content; nothing an account owns expires):

| Record | Key | Content |
| --- | --- | --- |
| User | `user:<userId>` | `id`, `email` (normalized), `emailVerifiedAt?`, `passwordHash?`, `createdAt`, `calendarToken?` |
| Email index | `email:<email>` | `userId`. Created insert-if-absent: two users can never share an email |
| Session | `sess:<sha256(token)>` | `userId`, `createdAt`, `lastSeenAt`, `userAgent` (≤ 200 chars). TTL 90 days, slid at most once a day |
| User's sessions | `usess:<userId>` | set of session hashes (sign out everywhere, account delete) |
| Email token | `tok:<sha256(token)>` | `purpose` (`confirm` \| `magic` \| `reset` \| `email-change`), `userId`, `newEmail?`, `expiresAt`. Consumed atomically (get-and-delete). TTL = expiry |
| Data | `data:<userId>` | `{ version, updatedAt, data, exportOptions }` |
| Data version | `datav:<userId>` | the version number alone, so `?since=` checks are one small read |
| Calendar token | `sub:<token>` | `{ userId }` |
| Digest | `dig:<userId>` | `{ frequency, unsubscribeKey, lastPeriod?, lastSentAt? }` (address = the account email) |
| Digest index | `dig:index` | set of userIds |
| Feed caches | `src:<userId>:<feedId>`, `chg:<userId>` | as today, keyed by user so rotating the token keeps them |
| Rendered calendar | `ics:<userId>:<view>` | `{ ics, renderedAt }`, TTL 15 min; `icsk:<userId>` set lists them so a data save can delete them |
| Rate limits | `rl:<action>:<ip|email>` | counters, as today |

Required operations (every database has them): get, put, delete, insert-if-absent, atomic get-and-delete, set add/remove/members, counter with expiry, and **compare-and-set of the data document on its version** (Redis: a Lua script that checks `datav`, writes `data` and `datav`, and returns the new version or a conflict; Postgres later: `UPDATE … WHERE version = $n`).

## Auth core

`lib/server/auth/*`, server-only. Pure parts (`normalizeEmail` reuse from `lib/digest.ts`, password policy, token hashing, expiry math, rate-limit decisions) are testable without Next.

- **Passwords:** `scrypt` (N=2^15, r=8, p=1, 64-byte key, 16-byte salt), stored as `scrypt$N$r$p$salt$hash` (base64url). Verify with `timingSafeEqual`. Policy: 10–200 characters. Login with a wrong password and login with an unknown email take the same path (a dummy hash is verified) so timing doesn't reveal accounts.
- **Tokens:** 32 random bytes, base64url. Only the sha256 is stored. Expiry: confirm 48 h, magic 30 min, reset 30 min, email-change 48 h.
- **Session cookie:** `hr_session`, `httpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, `Max-Age` 90 days. Mutating API routes also require `Origin` to match the host (CSRF defence in addition to SameSite).
- **Rate limits:** register 5/h per IP; login 10/15 min per IP and 5/15 min per email; magic link and reset 3/h per email and 10/h per IP. Over the limit: 429 "Túl sok próbálkozás, próbáld újra később".

## Flows

All links in mails open `/fiok/link?m=<megerosites|belepes|jelszo|email>&t=<token>`. That page shows one button (or the new-password form for `jelszo`) that POSTs; a GET never consumes a token, so mail scanners can't use it (same rule as `/hirlevel`).

- **Register** `POST /api/fiok/regisztracio {email, password}` → always `{ ok: true }` ("Nézd meg a postafiókod"):
  - new email: create an unconfirmed user, send the confirm mail;
  - existing **unconfirmed** email: replace the password hash, send a new confirm mail (stops squatting on someone else's address);
  - existing **confirmed** email: send an "already have an account" mail with a magic link instead.
- **Confirm** (`m=megerosites`): sets `emailVerifiedAt`, creates a session, redirects home.
- **Sign in** `POST /api/fiok/belepes {email, password}`: unconfirmed → 403 "Előbb erősítsd meg az e-mail-címedet" plus a resend button (it calls register's resend path through the magic endpoint). Wrong credentials → 401 "Hibás e-mail-cím vagy jelszó".
- **Magic link** `POST /api/fiok/link {email}` → always `{ ok: true }`; sends a magic link only if the user exists. Using it confirms the email if needed and creates a session.
- **Forgot password** `POST /api/fiok/jelszo-emlekezteto {email}` → always `{ ok: true }`. Using the link (`m=jelszo`) sets the new password, deletes every other session, and signs in.
- **Sign out** `POST /api/fiok/kilepes` (this session); `POST /api/fiok/kilepes?mindenhol=1` (all sessions).
- **Me** `GET /api/fiok` → `{ user: { id, email, hasPassword } }` or 401.
- **Change password** `PUT /api/fiok/jelszo {current?, next}` (current required when one is set). Deletes other sessions.
- **Change email** `PUT /api/fiok/email {email}` → mail to the new address; using it (`m=email`) swaps the email index entries atomically enough (insert-if-absent on the new one first; fail with "Ez a cím már foglalt" if taken).
- **Delete account** `DELETE /api/fiok {email}` (typed email as confirmation): removes user, email index, data, sessions, calendar token, feed caches, rendered calendars, digest and index membership.

Mails (`lib/authEmail.ts`, pure, same table layout and inlined light tokens as `lib/digestEmail.ts`, reusing its shell where it is exported): confirm, magic link, reset, already-registered, email-change. Plain Hungarian, one button each, the expiry stated.

## Data sync

- `GET /api/adatok?since=<v>` → `{ unchanged: true, version }` when `datav` equals `v`, else `{ version, updatedAt, data, exportOptions }`. A new account starts with version 0 and empty data.
- `PUT /api/adatok {baseVersion, data, exportOptions}` → `{ version }`, or 409 `{ conflict: true, version, data, exportOptions }`, or 413 over 900 KB, or 400 if invalid. Validation: `validateAppData` (new, in `lib/server/validate.ts`) extends `validateSnapshot`'s checks to the full `AppData` (courses with links/resources, timetable sources) and reuses `sanitizeUrls` from `lib/importData.ts`; caps as today (20 feeds, 1500 class sessions, 2000 ignored pairs). A successful save deletes the user's rendered calendars (`icsk:` members).
- **Client** `components/AccountSync.tsx` (rendered by `AppShell`, renders nothing) with pure helpers in `lib/sync/`:
  - On start: `GET /api/fiok`; 401 → redirect to `/belepes?vissza=<path>` (keep the cache). Then `GET /api/adatok`. If the server data is empty (version 0) and the cache holds data owned by this user or by nobody, upload it; otherwise replace the store's AppData and `exportOptions` with the server's.
  - The store gains `account: { userId, email } | null`, `syncedVersion`, `syncBase` (the last synced `{data, exportOptions}`, kept in memory and in the cache), and `syncStatus: "idle" | "saving" | "offline" | "error"` with `syncError?`.
  - Store changes to AppData slices or `exportOptions` → debounce 1 s → PUT with `baseVersion = syncedVersion`. On 409: `mergeAppData(base, local, remote)` (`lib/sync/merge.ts`, pure), set the merged result locally, retry once against the remote version. On network failure: `syncStatus = "offline"`, retry with backoff (2 s, 5 s, 15 s, 60 s), and immediately on `online`.
  - Pull with `?since=` on window focus / `visibilitychange` to visible and every 5 minutes while visible, only when nothing is pending; a newer version replaces the store data and the base.
  - `useHydrated()` keeps its meaning for device prefs; a new `useDataReady()` is true once the store holds this user's data (from the cache with matching `userId`, or from the server). Components that read AppData use `useDataReady()` where they used `useHydrated()`.
- **`mergeAppData(base, local, remote)`:** per id-keyed collection (`courses`, `deadlines`, `customPlatforms`, `feeds`, `classSessions`, `timetableSources`): an item only changed on one side takes that side's version (including deletion); changed on both → remote; added on both with the same id → remote. Order: remote's order, then local-only additions in local order. `ignoredDuplicatePairs` merges as a set (local adds and removes applied to remote). `exportOptions` and `version` field: the side that changed wins, both changed → remote. Equality by stable JSON.
- **Persisted cache:** zustand persist key becomes `hallgatoireteg-v2` and stores `ownerUserId` with the data. A cache owned by another user is discarded on start (device prefs `theme`, `showClasses`, `notificationPrefs` are kept; `notifiedKeys` are cleared). Sign out clears AppData, `exportOptions`, the base and `notifiedKeys` from the cache.
- `importData`, `resetAll`, `loadDemo` stay as they are: they change the store, so they sync.
- A small status line in the header (or the Fiók tab): "Mentve" / "Mentés…" / "Nincs mentve – offline" / the error.

## Calendar subscription (account-owned)

- `GET /api/fiok/naptar` → `{ token: string | null }`; `POST` creates one (if none) → `{ token }`; `POST ?uj=1` rotates (old `sub:` deleted, new token); `DELETE` turns it off (deletes `sub:`, rendered calendars). Feed caches stay (keyed by user).
- `GET /api/naptar/[token]` (public, unchanged URL shape and views): `sub:<token>` → userId → `ics:<userId>:<view>` cache hit (younger than 15 min) is returned as is; otherwise load `data:<userId>`, build the trimmed calendar input (what `buildSnapshot` did: courses without links/resources, `visibleSessions` capped at 1500), `loadLiveDeadlines` + `buildCalendar` as today, store the result in `ics:` and add the key to `icsk:`.
- `loadLiveDeadlines` and `renderSubscription` take `(store, userId, calendarInput, now)` instead of `(kv, token, sub)`; the `src:`/`chg:` keys use the userId.
- Removed: `POST /api/naptar`, `PUT|DELETE /api/naptar/[token]`, `Subscription.secret`, `pushSnapshot`/`createSubscription`/`rotateSubscription`/`deleteSubscription`, `components/SubscriptionSync.tsx`, `StoredSubscription`'s snapshot. `downloadCalendar()` and `buildCalendar` stay.

## Email digest (account-owned)

- `GET /api/fiok/hirlevel` → `{ digest: { frequency, lastSentAt? } | null, email, available }`; `PUT {frequency}` creates or updates (no confirmation step: the account email is confirmed; a new or changed frequency starts with its next period, as today); `DELETE` removes. It no longer requires the calendar subscription.
- Unsubscribe: `/hirlevel?m=leiratkozas&u=<userId>&k=<key>` and the RFC 8058 one-click POST, as today but keyed by userId. The digest confirm flow (`m=megerosites`, `confirmHash`, `renderConfirmEmail`) is removed.
- Cron: `dig:index` holds userIds; `runDigest(store, userId, now, appUrl)` reads the user (email, skip if unverified), the digest and `data:<userId>`, then works exactly as today. A user that no longer exists is removed from the index.
- Changing the account email changes the digest's address automatically.

## UI

All Hungarian, Hirdetőtábla components (`Card`, `SectionHeading`, `Dialog`, `components/ui/*`), no new dependencies.

- `/belepes`: one sheet with two modes, "Belépés" and "Regisztráció" (a segmented control), email + password fields, "Belépő link küldése e-mailben" and "Elfelejtett jelszó" links. After register/magic/forgot it shows the "Nézd meg a postafiókod" state. Honors `?vissza=`.
- `/fiok/link`: handles the five link kinds (button or new-password form), then redirects; shows "A link lejárt vagy már felhasználták" with a way to request a new one.
- Beállítások gets a **Fiók** tab (first in the list): email, change email, set/change password, sign out, sign out everywhere, delete account (typed-email confirmation in a `Dialog`), and the sync status.
- `CalendarSubscriptionSettings` and `DigestSettings` talk to the new routes; the digest no longer asks for an address (it shows the account email).
- `AppShell` hides the nav and header actions on `/belepes` and `/fiok/link`.
- **Gating:** `proxy.ts` (Next 16's replacement for middleware; read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) redirects requests for app pages without an `hr_session` cookie to `/belepes?vissza=…`. It is only an optimistic check; the API is the real gate (401), and the client handles 401 by redirecting.

## Errors

- 401 from any account API → redirect to `/belepes?vissza=<path>`; the cache is kept until the next user signs in.
- Storage not configured in production → 503 "A fiókok nincsenek beállítva a szerveren".
- Mail send failure on register/magic/reset → 502 "Most nem tudtunk levelet küldeni, próbáld később" (the user/token is still created; retrying resends).
- Server logs never contain email addresses, passwords, tokens or session ids.

## Testing

`node:test`, pure or server modules free of React/zustand/`"use client"`:

- `test/merge.test.ts`: `mergeAppData` (both add, edit on one side, edit on both, delete vs edit, ignored pairs, export options).
- `test/auth.test.ts`: password hash/verify and policy, token issue/consume/expiry/single use, register cases (new, unconfirmed again, confirmed again), login (unconfirmed, wrong password, unknown email), reset kills other sessions, email change collision, account delete removes everything. Runs against `memoryStore`; written as a contract suite so a future Postgres store can run it too.
- `test/accountData.test.ts`: `validateAppData`, compare-and-set conflict, the 900 KB cap, `.ics` cache invalidation on save.
- Existing `snapshot.test.ts`, `digestServer.test.ts`, `export.test.ts` adapted to the user-keyed functions.

## Docs

CLAUDE.md: replace "Local-first: no accounts, no auth" and the subscription/digest bullets with the account model (this spec, condensed). PLAN.md: add the shipped item and part 2 (Google + Apple, `jose`, Google Cloud and Apple Developer setup by the owner) under next steps; note capacity (free tiers: Upstash 500K commands/month, Resend 100 mails/day).

## Out of scope (part 2 or later)

Google and Apple sign-in; offline-first editing beyond the retry queue; per-field merge; admin tools; account export beyond the existing JSON export.
