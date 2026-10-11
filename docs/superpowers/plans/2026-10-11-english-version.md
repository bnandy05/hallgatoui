# English version + wording pass

Goal: every user-facing string exists in Hungarian and English. On the first visit the language comes from the browser: Hungarian if the browser's preferred language is Hungarian, English otherwise. The user can switch at any time, and the choice is remembered.

Workflow: Opus planned this; a Sonnet subagent implements **one phase at a time**, runs `npm run lint && npm run build && npm test` itself, and does not commit. Opus reviews the diff between phases.

## Wording audit (done by Opus)

All ~700 Hungarian UI strings, the auth and digest mails, API errors and the .ics texts were read. Nothing is rude, sarcastic or condescending. The informal "te" form is used consistently, which suits a student tool. A few lines read as blaming or awkward and get fixed in Phase 1:

| Where | Now | New |
| --- | --- | --- |
| `app/not-found.tsx` | "Lehet, hogy elírtad a címet, vagy az oldal már nem létezik." (blames the user) | "Lehet, hogy hibás a cím, vagy az oldal már nem létezik." |
| `CourseWeekDetail.tsx` (course not found) | "Lehet, hogy törölted, vagy hibás a link." | "Lehet, hogy a tárgyat törölték, vagy hibás a link." |
| `lib/server/auth/service.ts` `ERR_LINK`, `LinkAction.tsx`, `app/api/fiok/link/hasznal/route.ts` | "A link lejárt vagy már felhasználták" (impersonal "they used it") | "A link lejárt, vagy már fel lett használva" |
| `lib/digestEmail.ts` | "Lejárt · még nincs kipipálva" (slightly nagging) | "Lejárt · nincs késznek jelölve" |
| `lib/digestEmail.ts` | "Lejárt és még nincs kipipálva: N határidő." | "N lejárt határidő nincs késznek jelölve." |
| `CourseWeekDetail.tsx` | "A következő hét napban nincs órája." (3rd person, odd) | "A következő hét napban nincs óra." |

Also: "Mentés" means both *Save* and *Backup* (DataSettings). In Hungarian it stays; in English use "Save" for buttons and "Backup" in the Data tab.

## Decisions

- **No new dependency.** Hand-rolled dictionaries (CLAUDE.md forbids new deps without asking).
- **No locale in the URL.** Routes stay Hungarian (`/radar`, `/beallitasok`) for both languages; the app is private behind sign-in, so localized URLs would buy nothing and would mean moving every route under `app/[lang]`. The language lives in a cookie.
- **Brand name** "Hallgatói réteg" stays untranslated in English (it is the product name); the English tagline/description is translated. *(Owner can override.)*
- **Privacy notice** gets a full English version; the English page says the Hungarian text is the authoritative one. *(Owner can override.)*
- **Built-in data** (platform names like "Egyéb", resource kinds, timetable source name, demo data) is translated **at display time** where it is a label from code, and **at creation time** where it is written into the user's data (default feed/source names, demo data).

## Architecture

### Locale model — `lib/i18n/`
- `locales.ts` (pure): `type Locale = "hu" | "en"`, `LOCALES`, `DEFAULT_LOCALE = "en"`, `LOCALE_COOKIE = "hr_lang"`, `pickLocale(acceptLanguage: string | null): Locale` — parse `Accept-Language` with q-values; return `"hu"` only if the **highest-ranked** language is `hu` / `hu-*`, otherwise `"en"`. `isLocale(x)`.
- `hu.ts`: the source dictionary, a nested `as const` object grouped by area (`nav`, `home`, `radar`, `deadline`, `course`, `settings.feeds`, `auth`, `errors`, `email.auth`, `email.digest`, `ics`, `privacy`, …). Strings with counts or variables are functions: `openDeadlines: (n: number) => \`${n} nyitott határidő\``.
- `en.ts`: `export const en: Messages = { … }` where `type Messages = DeepWiden<typeof hu>` (string literals widened to `string`, functions keep their signature). A missing or extra key is a type error, so `npm run build` enforces parity.
- `index.ts` (pure, no React): `getMessages(locale)`, `dateLocale(locale)` → date-fns `hu` / `enGB` (en-GB: Monday weeks, 24 h, day-month order), plus the locale-specific date format strings in the dictionary (`formats.dueLong: "yyyy. MMM d. HH:mm"` vs `"d MMM yyyy, HH:mm"`, etc.).
- English plurals: a tiny `plural(n, one, other)` helper in `index.ts`; Hungarian functions just ignore it.
- `I18nProvider.tsx` + `useT.ts` (client): context holding `{ locale, t }`; `useT()` returns `t`, `useLocale()` returns the locale. `t` is the messages object itself (`t.radar.title`, `t.home.openDeadlines(3)`), so there is no string-key lookup and TS autocompletes.
- `server.ts` (server only): `getLocale()` reads the `hr_lang` cookie via `cookies()` (falls back to `pickLocale(headers().get("accept-language"))`), `getT()`.

### First visit and switching
- `proxy.ts`: before the session check, if the request has no valid `hr_lang` cookie, compute `pickLocale(request.headers.get("accept-language"))` and set the cookie on the response (both on `NextResponse.next()` and on the redirect to `/belepes`), `Path=/`, 1 year, `SameSite=Lax`, not httpOnly (the client reads it). Widen the matcher so the public pages (`/belepes`, `/fiok/link`, `/hirlevel`, `/adatvedelem`) also get the cookie, but keep the session redirect limited to the current set (check the path inside the function with `isPublicPath`).
- Root layout: `<html lang={locale}>`, wraps the app in `I18nProvider locale={locale}`. `metadata` becomes `generateMetadata` (title template/description from the dictionary); page-level `metadata` exports become `generateMetadata` using `getT()`.
- `app/manifest.ts`: use the locale from `getLocale()` if it works in a manifest route; otherwise keep Hungarian and note it.
- Switching: a language control in **Beállítások → Megjelenés** ("Nyelv" / "Language": Magyar · English) and a compact `HU | EN` toggle on the sign-in page (`AuthForm`). Switching sets the cookie, saves the preference (below), tells the service worker to clear its page cache, then `router.refresh()`.
- **The settings choice switches everything.** Choosing a language in Beállítások applies it to the whole experience at once: UI text, server error messages, auth mails, digest mails and the subscribed .ics (whose cache is dropped on change). The user record stores `locale` and `localeExplicit` (`AccountStore`, both implementations): at registration `locale` is taken from the cookie with `localeExplicit: false`; a choice in settings (or the sign-in page toggle while signed in) goes through `PUT /api/fiok/nyelv` and sets `localeExplicit: true`. On sign-in on any device: if the account's choice is explicit, the server sets the `hr_lang` cookie to it (the account wins over browser detection); otherwise the account's `locale` is updated from the cookie. Every server-side text for a signed-in user (mails, .ics, errors on authenticated routes) uses the account `locale`; signed-out requests use the cookie. Existing users without a value default to `hu`, not explicit.

### Server-side text
- **API errors**: route handlers read the locale from the request cookie (`getLocale()` or `request.cookies`) and return the localized `error`; add a stable `code` next to it where the client branches on it (`LinkAction.tsx` currently compares the error *string* "A link lejárt…" — switch it to `code: "link_expired"`).
- **Auth emails** (`lib/authEmail.ts`): take a `locale` param; the request's cookie locale at send time.
- **Digest** (`lib/digest.ts` labels, `lib/digestEmail.ts`): take a `locale`; `runDigest` reads it from the user record (default `"hu"` for existing users, since all current users are Hungarian). The month/weekday arrays, `countWord`, `criticalClause` etc. move into the dictionary as functions. English mail keeps the same layout.
- **Calendar export** (`lib/ical/export.ts`, `views.ts`, `lib/server/calendar.ts`): `buildCalendar` gets `locale` in its options (summaries like "📋 Heti radar", "📚 Készülés", "(módosult)", "Források:", "Oktató:", "Szünnap:", alarm texts, feed warning, calendar names). `renderCalendar` reads the user's locale; the cache key becomes `ics:<userId>:<locale>:<view>` (still listed in `icsk:<userId>`, so `saveData` deletion keeps working) and the language endpoint also drops the cache. The browser download (`downloadCalendar()`) uses the current UI locale. iCal UIDs do **not** change.
- **Feed errors** from `lib/ical/fetch.ts` / `ssrf.ts` are thrown as Error messages and shown in the UI: give them codes (`IcalError` with `code`), localize at the boundary (API route / client).

### Pure libs with text
- `lib/radar.ts` week labels ("Ez a hét", "Jövő hét", "Múlt hét"), `lib/notifications.ts` lead-time labels and notification body, `lib/reminders.ts`, `lib/search.ts` page/action titles, `lib/platforms.ts` (`Egyéb`, resource kind labels), `lib/digest.ts` frequency labels: return keys or accept `t`/`locale` instead of hard-coded Hungarian. Keep them free of React so tests can import them.
- `formatRelative` and other date formatting: pass the date-fns locale.
- `lib/quickAdd.ts`: keep the Hungarian keywords and **add English ones** (today, tomorrow, mon…sun, next <weekday>, "in N days", English month names); the parser accepts both languages regardless of UI locale. Placeholder/help text comes from the dictionary.
- `lib/ical/parse.ts` "(névtelen)" → localized fallback at display time (store a neutral marker or keep the string per locale at parse time — pick the simplest that doesn't break `externalUid` matching; titles are data).
- `lib/ical/canvas.ts` "Ea" → "Előadás" and Neptun parsing are content parsing, not UI: leave them.
- `lib/demo.ts`: `demoData(locale)` with an English set (same structure, English course names and titles).

### Service worker
App pages are cached per URL and now differ by language: on language switch post a `clear-pages` message (like sign-out), and bump `VERSION` in `public/sw.js`.

## Phases

**Phase 1 — foundation + wording fixes**
- Apply the wording table above (Hungarian only).
- `lib/i18n/*` (locales, `hu.ts`/`en.ts` skeleton with the areas used in this phase, provider, hooks, server helpers), proxy cookie logic + matcher, root layout (`lang`, provider, `generateMetadata`), language control in Megjelenés and on the sign-in page, SW message + `VERSION` bump.
- Translate the app shell (`AppShell`, nav, footer, `ThemeToggle`, `SyncStatus`, `RemindersMenu`, `CommandPalette`, `not-found`, `components/ui/*` aria labels).
- Tests: `test/i18n.test.ts` for `pickLocale` (`hu`, `hu-HU`, `hu;q=0.9,en;q=1` → en, `en-US,hu;q=0.8` → en, `de` → en, empty/null → en, malformed → en).

**Phase 2 — all pages and components**
- Move every remaining string in `app/**` and `components/**` into the dictionaries with English translations: home, radar, course page, dialogs and forms (`DeadlineForm`, `CourseForm`, `LinkEditor`, `ResourceList`, `DeadlineItem`, `DuplicateSources`, `Discovery*`, `Timetable*`), all `components/settings/*`, `components/auth/*`, `/hirlevel`, every `confirm()` text, every `aria-label`/`title`/`placeholder`.
- Dates in components via `dateLocale(locale)` and dictionary format strings.
- Built-in platform / resource-kind labels at display time; default names written into data (feed name, "Neptun órarend") use the current locale at creation.
- `lib/demo.ts` English set.
- Done when `grep -rnE '[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]' app components --include='*.tsx'` only hits `lib/i18n/hu.ts`-style dictionary files, comments, the privacy page (Phase 3), and data (demo/keywords).

**Phase 3 — server, emails, calendar, pure libs, privacy**
- API error localization + codes (`LinkAction` uses the code), `IcalError` codes.
- `locale` + `localeExplicit` on the user record as described under "First visit and switching" (`AccountStore` both implementations, `PUT /api/fiok/nyelv`, sign-in sets the cookie from an explicit account choice; default `hu`, not explicit), deleted with the account as part of the record. Phase 1 ships the settings control cookie-only; Phase 3 connects it to the account so mails and the .ics follow.
- Auth emails and digest mails in both languages; `buildCalendar`/`renderCalendar` with locale and the new cache key.
- `radar`, `notifications`, `reminders`, `search`, `platforms`, `digest` labels; `quickAdd` English keywords.
- Privacy notice: English version of `app/adatvedelem/page.tsx` (content moved into the dictionary or a `privacyContent(locale)` module), plus the new stored item (account language preference, and the `hr_lang` cookie in the cookie list) in **both** languages, and bump `PRIVACY_UPDATED`.
- Tests: English digest mail and English .ics snapshots/assertions alongside the existing Hungarian ones; `quickAdd` English cases ("Essay next tuesday 10:00 !", "Quiz tomorrow"); store tests for `locale` on the record; cache key includes locale.

**Phase 4 — docs and check**
- `CLAUDE.md`: replace "all UI text is Hungarian" with the i18n convention (dictionaries in `lib/i18n`, `useT()`/`getT()`, no raw UI strings in components, English and Hungarian kept in step, routes stay Hungarian, cookie `hr_lang`, account `locale`). `docs/PLAN.md`: add to Done. README: mention English.
- Opus does one browser check at the end: first visit with an English and a Hungarian `Accept-Language`, switching, sign-in page, home, radar, a course, every settings tab, dark mode, mobile width.

## Out of scope
- More languages (the structure allows it; `pickLocale` would need a list).
- Translating user data or feed contents.
- Localized URLs.
