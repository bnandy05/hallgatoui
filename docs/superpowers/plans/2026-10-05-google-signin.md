# Google Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Folytatás Google-fiókkal" on `/belepes` plus link/unlink in Beállítások → Fiók, on the existing hand-rolled auth.

**Architecture:** OAuth 2.0 authorization code + PKCE against Google, ID token verified with `node:crypto` against Google's JWKS. Pure token logic in `lib/server/auth/googleToken.ts`, account resolution in `lib/server/auth/google.ts` over `AuthDeps`, two GET routes and one DELETE under `app/api/fiok/google`. Identity index `oidc:google:<sub>` in `AccountStore`.

**Tech Stack:** Next 16 route handlers, `node:crypto`, Upstash Redis / memory store, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-05-google-signin-design.md` (read it first; error codes, messages, URLs and resolution rules are defined there and not repeated here).

## Global Constraints

- No new dependencies (no `jose`, no Auth.js).
- UI text Hungarian, code/comments English; copy from the spec verbatim.
- Never log emails, codes, tokens, `sub` values or session ids.
- Tests import only modules free of React, zustand and `"use client"`; `npm test` runs with `TZ=UTC`.
- Raw hex only in `components/auth/GoogleMark.tsx` (Google brand colours).
- Do not commit; the owner commits. Run `npm test`, `npm run lint` and `npm run build` yourself at the end of each phase.
- Read `node_modules/next/dist/docs/` for route handlers / redirects / cookies if unsure (Next 16 differs from training data).

## Review Focus

- The user cancels on Google's screen (`error=access_denied`) → back to `/belepes` with no error banner (Task 3 test via `callbackRedirect` helper).
- `hr_oauth` cookie missing (third-party cookie quirks, different browser) → error `google`, never a session (Task 3).
- Same Google account used to sign in after the account email was changed → still the same account (Task 2 test).
- Unconfirmed squatter account with a password, real owner uses Google → password gone, squatter sessions gone (Task 2 test).
- `vissza` pointing off-site (`//evil.com`) → `/` (Task 3 uses `safeReturnPath`; test).

---

### Task 1: Store additions and ID-token verification

**Files:**
- Modify: `lib/server/account/store.ts`, `lib/server/account/keys.ts`, `lib/server/account/memoryStore.ts`, `lib/server/account/redisStore.ts`
- Create: `lib/server/auth/googleToken.ts`, `lib/server/auth/googleConfig.ts`
- Test: `test/google.test.ts` (new), `test/accountStore.test.ts` (extend if it is a contract suite)

**Interfaces (produces):**
- `StoredUser.googleSub?: string`
- `export type IdentityProvider = "google"`
- `AccountStore.claimIdentity(provider, sub, userId): Promise<boolean>`, `userIdByIdentity(provider, sub): Promise<string | null>`, `releaseIdentity(provider, sub): Promise<void>`
- `export interface OAuthState { verifier: string; nonce: string; vissza: string; linkUserId?: string; expiresAt: string }`
- `AccountStore.putOAuthState(hash, state: OAuthState, ttlSeconds): Promise<void>`, `takeOAuthState(hash): Promise<OAuthState | null>` (atomic get-and-delete)
- keys: `identityKey(provider, sub)` → `oidc:<provider>:<sub>`, `oauthStateKey(hash)` → `oauth:<hash>`
- `googleConfig(): { clientId: string; clientSecret: string } | null` (env `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- `pkceChallenge(verifier: string): string` (base64url sha256)
- `export interface GoogleClaims { sub: string; email: string | null; emailVerified: boolean }`
- `verifyGoogleIdToken(idToken: string, opts: { clientId: string; nonce: string; now: Date; getKey: (kid: string) => Promise<KeyObject | null> }): Promise<GoogleClaims | null>` — rules in spec "ID-token verification"
- `googleKeys(fetchImpl = fetch): (kid: string) => Promise<KeyObject | null>` — JWKS cache in module memory per spec (max-age, refetch once on unknown kid)
- `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_CERTS_URL` constants

- [ ] **Step 1: Write failing tests** in `test/google.test.ts`. Helper: `generateKeyPairSync("rsa", { modulusLength: 2048 })`, sign JWTs with `crypto.sign("sha256", …)`, `getKey = async (kid) => kid === "k1" ? publicKey : null`. Base claims: `iss: "https://accounts.google.com"`, `aud: "cid"`, `sub: "123"`, `email: "Anna@X.hu"`, `email_verified: true`, `nonce: "n"`, `iat/exp` around `now`.
  - `valid token → { sub: "123", email: "anna@x.hu", emailVerified: true }`
  - each of these → `null`: signature from another key; `kid: "k2"`; header `alg: "HS256"`; `iss: "https://evil.com"`; `aud: "other"`; `exp` 2 minutes before now; `nonce: "x"`; `iat` 10 minutes in the future; `sub: ""`
  - `iss: "accounts.google.com"` accepted
  - `email_verified: false → emailVerified: false` (not null)
  - `pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"` (RFC 7636)
  - memory store: `claimIdentity` twice for different users → second false; `userIdByIdentity`; `releaseIdentity` frees it; `takeOAuthState` returns the record once, then null.
- [ ] **Step 2:** `npm test` → new tests fail (missing modules).
- [ ] **Step 3: Implement** the interfaces above. Redis: `set … { nx: true }` for `claimIdentity`, `getdel` for `takeOAuthState`. Verification uses `createPublicKey({ key: jwk, format: "jwk" })` inside `googleKeys` and `crypto.verify("sha256", data, key, sig)`; reject malformed base64/JSON by returning null (never throw).
- [ ] **Step 4:** `npm test` → all pass.

### Task 2: Account resolution

**Files:**
- Create: `lib/server/auth/google.ts`
- Modify: `lib/server/auth/service.ts` (export `startSession`; `deleteAccount` releases `googleSub` identity)
- Test: `test/google.test.ts` (reuse `setup()` style from `test/auth.test.ts`)

**Interfaces:**
- Consumes: Task 1 store methods, `AuthDeps`, `AuthError`, `startSession(d, userId, ua?)`.
- Produces:
  - `export type GoogleErrorCode = "google" | "google-email" | "google-foglalt" | "google-masik" | "google-sok"`
  - `export const GOOGLE_ERRORS: Record<GoogleErrorCode, string>` (messages from the spec table; also used by the UI, so put it in a client-safe module: `lib/account/googleErrors.ts`, re-exported here)
  - `googleSignIn(d: AuthDeps, claims: { sub: string; email: string }, ua?: string): Promise<{ sessionToken: string; userId: string } | { code: GoogleErrorCode }>`
  - `linkGoogle(d: AuthDeps, user: StoredUser, sub: string): Promise<{ ok: true } | { code: GoogleErrorCode }>`
  - `unlinkGoogle(d: AuthDeps, user: StoredUser): Promise<void>`

- [ ] **Step 1: Write failing tests:**
  - `googleSignIn new email → user with emailVerifiedAt, no passwordHash, googleSub "g1"; userIdByIdentity("google","g1") === userId; sessionUser(sessionToken) is that user`
  - `googleSignIn on confirmed password account → same userId, passwordHash kept, googleSub set`
  - `googleSignIn on unconfirmed account → emailVerifiedAt set, passwordHash undefined, a session created before (via store.putSession) is gone`
  - `after requestEmailChange+consumeLink to b@x.hu, googleSignIn({sub:"g1", email:"anna@x.hu"}) → original userId`
  - `email account already linked to "g2", googleSignIn({sub:"g1", same email}) → { code: "google-masik" }`
  - `linkGoogle with sub linked to another user → { code: "google-foglalt" }; same user twice → ok`
  - `unlinkGoogle then linkGoogle(sub) from another user → ok`
  - `deleteAccount of a linked user → userIdByIdentity null`
  - dangling identity (identity points to a deleted user id) → falls through to email/new-user path and re-claims.
- [ ] **Step 2:** `npm test` → fail.
- [ ] **Step 3: Implement** per spec "Account resolution". Lost email-claim race → `{ code: "google" }`.
- [ ] **Step 4:** `npm test` → pass.

### Task 3: Routes and client helpers

**Files:**
- Create: `app/api/fiok/google/route.ts` (GET start, DELETE unlink), `app/api/fiok/google/vissza/route.ts` (GET callback), `lib/server/auth/googleFlow.ts`
- Modify: `app/api/fiok/route.ts` (GET adds `google`, `googleAvailable`), `lib/server/auth/http.ts` (`oauthCookie(state)`, `clearedOAuthCookie()`, `OAUTH_COOKIE = "hr_oauth"`, a `cookieValue(req, name)` helper reused by `sessionTokenOf`), `lib/account/client.ts` (`AccountUser.google`, `.googleAvailable`, `unlinkGoogle(): Promise<string | null>`)
- Test: `test/google.test.ts`

**Interfaces:**
- Produces in `googleFlow.ts` (pure, testable):
  - `authorizeUrl(cfg: { clientId: string }, redirectUri: string, state: string, nonce: string, challenge: string): string`
  - `callbackRedirect(mode: "signin" | "link", outcome: { ok: true; vissza: string } | { cancelled: true } | { code: GoogleErrorCode }, vissza?: string): string` — the paths in the spec ("Error redirects", step 3 and 7 of Callback)
  - `exchangeCode(cfg, redirectUri, code, verifier, fetchImpl = fetch): Promise<string | null>` (returns `id_token`, 10 s `AbortSignal.timeout`)
- Routes compose: `googleConfig()` (404 when null), `authDeps`, rate limit `rl:google-start:<ip>` 20 / 600 s (use `store.kv.incr`), `newToken`, `hashToken`, `pkceChallenge`, `putOAuthState` (TTL 600), `safeReturnPath`, `requireUser` (link mode), `takeOAuthState`, `timingSafeEqual` on state vs cookie, `verifyGoogleIdToken` with `googleKeys()`, `googleSignIn`/`linkGoogle`, `sessionCookie`. Responses: `Response.redirect` cannot carry extra cookies reliably — build `new Response(null, { status: 302, headers })` with `location`, `cache-control: no-store`, and appended `set-cookie`s. Wrap in `guarded`.
- `redirectUri = \`${publicAppUrl(req)}/api/fiok/google/vissza\``.

- [ ] **Step 1: Write failing tests** for `googleFlow.ts`:
  - `authorizeUrl` has `response_type=code`, `scope=openid email`, `code_challenge_method=S256`, `prompt=select_account`, the given `state`/`nonce`/`redirect_uri`.
  - `callbackRedirect("signin", {cancelled:true}) === "/belepes"`; `("link", {cancelled:true}) === "/beallitasok#fiok"`
  - `callbackRedirect("signin", {code:"google-email"}, "/radar") === "/belepes?hiba=google-email&vissza=%2Fradar"`; with vissza `/` → `"/belepes?hiba=google-email"`
  - `callbackRedirect("link", {code:"google-foglalt"}) === "/beallitasok?google=google-foglalt#fiok"`; `("link", {ok:true, vissza:"/"}) === "/beallitasok?google=ok#fiok"`; `("signin", {ok:true, vissza:"/targy/x"}) === "/targy/x"`
  - `exchangeCode` with a stub fetch returning `{ id_token: "t" }` → `"t"`; non-200 → null; posts `grant_type=authorization_code` and `code_verifier`.
  - `safeReturnPath("//evil.com") === "/"` is already covered in `returnPath.test.ts`; make sure the start route stores `safeReturnPath(vissza)`.
- [ ] **Step 2:** `npm test` → fail. **Step 3:** implement. **Step 4:** `npm test` → pass.

### Task 4: UI

**Files:**
- Create: `components/auth/GoogleMark.tsx` (18×18 inline SVG "G", `aria-hidden`)
- Modify: `app/belepes/page.tsx` (`<AuthForm googleEnabled={googleConfig() !== null} />`), `components/auth/AuthForm.tsx`, `components/settings/AccountSettings.tsx`

- [ ] **Step 1:** `AuthForm({ googleEnabled }: { googleEnabled: boolean })`: in views `belepes` and `regisztracio`, above the email form, an `<a>` styled like the secondary `Button` (reuse its classes; check `components/ui/Button.tsx` for an exported variant class helper, otherwise match it) with `GoogleMark` + "Folytatás Google-fiókkal", `href={\`/api/fiok/google?vissza=${encodeURIComponent(back)}\`}`; then a divider: two `border-border` rules with "vagy" in `text-muted` between. `searchParams.get("hiba")` in `GOOGLE_ERRORS` → show it where the form shows its errors.
- [ ] **Step 2:** `AccountSettings`: a "Google-fiók" section (same `SectionHeading`/card pattern as the password block) only when `me.user.googleAvailable`; linked → text + "Leválasztás" (secondary, confirmation `Dialog` "Leválasztod a Google-fiókot?" / "Utána e-mailes linkkel vagy jelszóval lépsz be." / buttons "Mégse", "Leválasztás"); not linked → text + `<a href="/api/fiok/google?kapcsolas=1">Összekapcsolás</a>` as a secondary button; privacy line "Csak az e-mail-címedet és a Google-azonosítódat kapjuk meg." in `text-muted`. On mount read `?google=` from `window.location.search`: `ok` → "Google-fiók összekapcsolva.", a known code → its message; then `history.replaceState` without the query, keeping `#fiok`.
- [ ] **Step 3:** `npm run lint && npm run build` pass. Start `npm run dev` without Google env and check `/belepes` hides the button; with dummy `GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y` the button shows and `GET /api/fiok/google` returns a 302 to `accounts.google.com` with an `hr_oauth` cookie (`curl -sI`).

### Task 5: Docs

**Files:** `README.md`, `CLAUDE.md`, `docs/PLAN.md`

- [ ] **Step 1:** README: "Google-belépés" setup section with the three owner steps from the spec (Hungarian, like the rest of the README).
- [ ] **Step 2:** CLAUDE.md accounts bullet: add Google (start/callback/DELETE routes, `oidc:google:<sub>`, `oauth:<hash>` state, automatic linking by confirmed email, env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `lib/server/auth/googleToken.ts` + `google.ts`, no `jose`).
- [ ] **Step 3:** PLAN.md: add "Accounts part 2: Google sign-in" to Done (not browser-checked, owner must create the Google client); replace the "Next" section with Apple only (Apple Developer Program $99/year, verified domain only, client secret JWT can be generated per request with `node:crypto`, Hide My Email needs the sending domain registered with Apple's relay).
