# Google sign-in (accounts part 2)

Status: approved in chat 2026-10-05. Builds on `2026-10-05-accounts-design.md` (part 1).

## Decisions

- **Google only.** Sign in with Apple needs the paid Apple Developer Program ($99/year) and only works on verified domains; it is postponed. The design keeps the provider in key names (`oidc:google:…`) so Apple can be added the same way later.
- **Free and on the current stack.** A Google Cloud OAuth client with only the `openid email` scopes needs no payment and no Google verification. It runs on Vercel + Upstash with two routes and a few Redis keys.
- **No new dependency.** Authorization code flow with PKCE, hand-rolled on `node:crypto` like the rest of `lib/server/auth`. ID tokens (RS256) are verified with `crypto.createPublicKey({ key: jwk, format: "jwk" })` and `crypto.verify`.
- **Automatic linking by confirmed email.** A Google sign-in whose verified email matches an account signs into that account and links Google to it.
- **Optional.** Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` the Google button and the Fiók row are hidden and the routes answer 404.

## Flow

### Start: `GET /api/fiok/google?vissza=<path>[&kapcsolas=1]`

1. 404 when Google isn't configured; 503 without storage (as other `/api/fiok` routes).
2. Rate limit `rl:google-start:<ip>`: 20 per 10 minutes → redirect to `/belepes?hiba=google-sok`.
3. `kapcsolas=1` (link mode) requires a session (`requireUser`); without one → redirect to `/belepes`.
4. Generate `state`, `nonce` and a PKCE `verifier` (each `newToken()`); `challenge = base64url(sha256(verifier))`.
5. Store `oauth:<sha256(state)>` → `{ verifier, nonce, vissza: safeReturnPath(vissza), linkUserId?, expiresAt }` with a 10-minute TTL (kv `set` with TTL; consumed by an atomic get-and-delete, see Storage).
6. Set cookie `hr_oauth=<state>; HttpOnly; SameSite=Lax; Path=/api/fiok/google; Max-Age=600` (+ `Secure` in production). It binds the flow to this browser (login CSRF defence).
7. 302 to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`, `prompt=select_account`.

`redirect_uri` is `${publicAppUrl(req)}/api/fiok/google/vissza`, identical in start and callback.

### Callback: `GET /api/fiok/google/vissza?code&state` (or `?error=…&state`)

1. Read `hr_oauth`; always clear it in the response.
2. `state` must equal the cookie (constant-time compare) and the `oauth:` record must exist (taken atomically, single use) and not be expired. Otherwise → error `google`.
3. `error=access_denied` (user cancelled) → redirect to `/belepes` (link mode: `/beallitasok#fiok`) without a message. Any other `error` → error `google`.
4. Exchange the code: `POST https://oauth2.googleapis.com/token` (form: `code`, `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`, `code_verifier`), 10 s timeout. Failure → error `google`.
5. Verify the `id_token` (`verifyGoogleIdToken`, below). Failure → error `google`; `email_verified` false → error `google-email`.
6. Link mode: the current session's user must equal `linkUserId`, else error `google`. Then `linkGoogle`. Sign-in mode: `googleSignIn`, then start a session and set `hr_session`.
7. Success → 302 to `vissza` (sign-in) or `/beallitasok?google=ok#fiok` (link).

Error redirects: sign-in mode `/belepes?hiba=<code>` (keeping `vissza` if it was not `/`), link mode `/beallitasok?google=<code>#fiok`. Codes and Hungarian messages:

| Code | Message |
| --- | --- |
| `google` | A Google-belépés nem sikerült, próbáld újra. |
| `google-email` | A Google-fiókod e-mail-címe nincs megerősítve. Lépj be e-maillel. |
| `google-foglalt` | Ez a Google-fiók már egy másik fiókhoz tartozik. |
| `google-masik` | Ehhez a fiókhoz már egy másik Google-fiók tartozik. |
| `google-sok` | Túl sok próbálkozás, próbáld újra később. |

Server logs never contain emails, codes, tokens, `sub` values or session ids.

## ID-token verification (`lib/server/auth/google.ts`)

`verifyGoogleIdToken(idToken, { clientId, nonce, now, getKey })` → `{ sub, email, emailVerified } | null`, pure apart from `getKey(kid)`:

- three base64url parts; header `alg` must be `RS256` and carry a `kid`;
- signature valid for `getKey(kid)` (`crypto.verify("sha256", …)`);
- `iss` is `accounts.google.com` or `https://accounts.google.com`;
- `aud` equals `clientId` (string, or array containing it with `azp` equal to `clientId`);
- `exp` in the future and `iat` not more than 5 minutes in the future (both with 60 s leeway);
- `nonce` equals the stored nonce;
- `sub` a non-empty string ≤ 255 chars; `email` normalised with `normalizeEmail`.

`googleKeys()`: fetches `https://www.googleapis.com/oauth2/v3/certs`, caches the JWK set in module memory until the `cache-control` `max-age` expires (default 1 hour), and refetches once when a `kid` is unknown. Fixed Google URLs only; the iCal SSRF guard is not involved.

## Account resolution (`lib/server/auth/google.ts`, over `AuthDeps`)

`googleSignIn(d, { sub, email }, ua)` → `{ sessionToken, userId } | AuthError`:

1. `oidc:google:<sub>` exists and its user exists → sign in. (A dangling entry is released and resolution continues.)
2. Else an account with `email` exists:
   - it has a different `googleSub` → error `google-masik`;
   - otherwise claim `oidc:google:<sub>`, set `googleSub`, and if the account was unconfirmed: set `emailVerifiedAt`, remove `passwordHash`, delete all its sessions (Google proved ownership; the pending password may be a squatter's). Sign in.
3. Else create a user `{ id, email, emailVerifiedAt: now, createdAt, googleSub }` with no password, claim the email (lost race → error `google`), claim the identity, sign in.

`linkGoogle(d, user, { sub })`:
- `oidc:google:<sub>` already points to another user → error `google-foglalt`; points to this user → ok;
- the user has a different `googleSub` → error `google-masik` (unlink first);
- otherwise claim and set `googleSub`. The Google email may differ from the account email; it is not stored.

`unlinkGoogle(d, user)`: release `oidc:google:<user.googleSub>` and clear `googleSub`. Always allowed: the confirmed account email still works with a magic link.

`deleteAccount` also releases the identity.

## Storage

- `StoredUser.googleSub?: string`.
- `AccountStore` gains `claimIdentity(provider, sub, userId)` (insert-if-absent, false when taken), `userIdByIdentity(provider, sub)`, `releaseIdentity(provider, sub)`; key `oidc:<provider>:<sub>` in `keys.ts`. Memory and Redis implementations as for `claimEmail`.
- OAuth state: `oauth:<sha256(state)>` in `store.kv` with a 10-minute TTL. It is single use: `AccountStore.takeOAuthState(hash)` (atomic get-and-delete; Redis `getdel`), `putOAuthState(hash, record, ttl)`.
- Rate limit counter `rl:google-start:<ip>`.

## Routes

- `GET /api/fiok/google` (start), `GET /api/fiok/google/vissza` (callback): both GETs, so there is no Origin check; the `state` cookie and record are the CSRF defence. Responses are `no-store`.
- `DELETE /api/fiok/google`: session + Origin check → `unlinkGoogle` → `{ ok: true }`.
- `GET /api/fiok` adds `google: boolean` (linked) and `googleAvailable: boolean` (configured).
- `proxy.ts` is unchanged (`/api` is excluded).
- `lib/server/auth/googleConfig.ts`: `googleConfig()` → `{ clientId, clientSecret } | null` from env.

## UI

- `app/belepes/page.tsx` passes `googleEnabled={googleConfig() !== null}` to `AuthForm`.
- `AuthForm`, in the "Belépés" and "Regisztráció" views: a full-width secondary button "Folytatás Google-fiókkal" with the Google "G" mark (`components/auth/GoogleMark.tsx`, inline SVG with Google's four brand colours — the one allowed raw-hex exception besides the email templates), above the email form, then a "vagy" divider. It is a plain link (`<a href>`, full page navigation) to `/api/fiok/google?vissza=<back>`. `?hiba=<code>` shows the matching message in the form's error style.
- Beállítások → Fiók (`AccountSettings`): a "Google-fiók" block, shown only when `googleAvailable`:
  - linked: "Összekapcsolva. Google-fiókkal is beléphetsz." + "Leválasztás" (secondary, confirm in a `Dialog`);
  - not linked: "Kapcsold össze, hogy Google-fiókkal is beléphess." + "Összekapcsolás" (link to `/api/fiok/google?kapcsolas=1`);
  - `?google=ok|<code>` on `/beallitasok` shows a success note or the error message once, then the query is removed with `history.replaceState`.
- `lib/account/client.ts`: `AccountUser` gains `google`, `googleAvailable`; `unlinkGoogle()` calls `DELETE /api/fiok/google`.
- Privacy line under the Google button area in settings: "Csak az e-mail-címedet és a Google-azonosítódat kapjuk meg."

## Testing (`test/google.test.ts`, memory store)

- `verifyGoogleIdToken` with a locally generated RSA key (`generateKeyPairSync`, JWK export): valid; wrong signature; unknown `kid`; `alg` other than RS256; wrong `iss`; wrong `aud`; expired; wrong `nonce`; `email_verified: false` reported.
- `googleSignIn`: new user (verified, no password, linked); existing confirmed user by email (linked, password kept); existing unconfirmed user (confirmed, password removed, old sessions gone); existing linked `sub` signs in even after an email change; email account with a different `googleSub` → `google-masik`.
- `linkGoogle`: `sub` owned by another user → `google-foglalt`; idempotent for the same user. `unlinkGoogle` frees the `sub` for another account.
- OAuth state record is single use and expires.
- `deleteAccount` releases the identity.
- PKCE challenge matches RFC 7636's test vector.

## Owner setup (README)

1. Google Cloud console → new project → OAuth consent screen: External, app name, support email; scopes `openid`, `email` only (no verification needed); publish the app (otherwise only listed test users can sign in).
2. Credentials → OAuth client ID → Web application; authorised redirect URIs: `https://<production domain>/api/fiok/google/vissza` and `http://localhost:3000/api/fiok/google/vissza`. Google allows no wildcards, so preview deployments show the button but the redirect is rejected unless their exact URL is added.
3. Vercel env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and `APP_URL` should be the production origin so the redirect URI matches).

## Docs

CLAUDE.md accounts bullet: add Google (routes, `oidc:google:<sub>`, automatic linking, env). PLAN.md: move Google to Done when shipped; Apple stays under Next with its cost and domain limits.

## Out of scope

Apple sign-in; other providers; showing the Google profile name or picture; Google One Tap.
