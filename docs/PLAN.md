# Roadmap

The working plan for Hallgatói réteg. It lives in the repo so every session (human or agent) starts from the same list. Update it when something ships or the plan changes.

Conventions for all work: see [`CLAUDE.md`](../CLAUDE.md). The process: an agent writes a brief, a subagent implements it, the agent reviews it and pushes to a `claude/*` branch, and the owner tests the Vercel preview and merges. The sandbox can't reach `*.vercel.app`, so testing on the deployed site is always the owner's job.

## Done (in `main`)

- **Offline, field-level sync and series** (plan: `docs/superpowers/plans/2026-10-05-offline-and-series.md`, branch `impeccablelocal`): per-item `updatedAt` + tombstones with a server-offset clock and a field-level latest-wins merge; a hand-written service worker (`public/sw.js`), manifest and icons so the app opens offline and can be installed; creating a deadline on several dates or repeating (`lib/recurrence.ts`, `seriesId`, series delete choice). Not yet checked in a browser (offline reload of `/`, `/radar`, a course page; install prompt; the form's new tabs; DST week across 25 Oct; sync of a series is one save).
- **Merged calendar subscription**:
  - one `.ics` link (`/api/naptar/<token>.ics`) for Apple and Google Calendar, backed by Upstash Redis;
  - the server re-fetches the source feeds every 15 minutes;
  - a warning event appears when a feed has been failing for more than 24 hours.
- **Calendar extras**:
  - views (`?nezet=osszes|kritikus|zh|targy-<id>`);
  - a Monday "📋 Heti radar" event;
  - "📚 Készülés" study blocks before critical deadlines;
  - a "(módosult)" marker for 48 hours after a due date moves;
  - past deadlines can be marked done when a feed is added, plus a "Lejártak késznek jelölése" button for existing feeds.
- **"Night blueprint" restyle**:
  - graph-paper background, highlighter-yellow and chalk-mint palette, `TraceField` circuit traces;
  - readability pass: brighter greys, a content scrim, visible borders and button edges.
- **README** rewritten.
- **Redesign is the default**: the former `/uj` routes replaced the old pages. Motion pass: the board's columns are drawn in and the now-line is drawn through today, the days slide when you change week, ticked deadlines get a drawn strike, and dialogs and tab panels have entrances (see DESIGN.md → Motion). Slips are pinned up on mount, ticked ones unpin and swing, unticked ones re-pin; the felt background shows one slip per done task (DESIGN.md → Pinboard Field, Slip motion).
- **Duplicate removal** (`lib/ical/dedupe.ts`, on by default, toggle in Beállítások → Naptár-előfizetés): source priority manual > canvas > moodle > neptun > other; "+N forrás" pill with "Nem duplikátum"; the calendar emits the primary with a "Források:" block; `ignoredDuplicatePairs` in `AppData`.
- **GDPR basics**: privacy notice at `/adatvedelem` (controller facts in `lib/legal.ts`), linked from registration and the footer; unconfirmed registrations expire after 7 days (`PENDING_ACCOUNT_TTL_SECONDS`); `/hirlevel` and `/adatvedelem` are public pages (`isPublicPath`), so signed-out visitors are no longer sent to `/belepes`. Owner to-do outside the code: accept the Vercel, Upstash and Resend DPAs and keep the Upstash database in an EU region.
- **Server "(módosult)" fix**: `chg:<userId>` record (was `chg:<token>`) (`lib/server/dueChanges.ts`), so the 48 h window starts when a move is first seen.
- **Neptun timetable import** (`lib/ical/neptun.ts`): one unified calendar import in Beállítások → Naptárak (link or .ics file, Neptun auto-detected by content), only current-week and future classes (existing users get past semesters purged on their next re-import), one-time subject mapping, classes on the home board, course page and course table, calendar view `?nezet=orarend` and `ExportOptions.includeClasses`. Classes are not deadlines.
- **Test runner**: `npm test` (`node:test`, `TZ=UTC`) with fixture-based tests for parsing, sync, canvas contexts, export, dedupe, due changes and the Neptun import.
- **Budapest all-day fix**: an all-day `DTSTART` is 23:59 Budapest time on the server too (`budapestInstant`).
- **"Hirdetőtábla" redesign** (replaces night blueprint): light felt ground, white copy-paper slips and sheets, toner-black primary, red pushpin for now/critical, canary/salmon/sky papers for today/overdue/classes, Archivo (condensed display). Deadlines are pinned slips whose pin carries state; done slips unpin and tilt. `PinboardField` canvas background (ghost slips seeded from open deadlines). Structure: nav Hét / Határidők / Beállítások, global "Új határidő" in the header, a "Következő" notice on the home page, eyebrows and asides removed, copy rewritten in plain professional Hungarian. See DESIGN.md.
- **Notice-board layout pass** (on top of "Hirdetőtábla"): home pairs the week heading with a pinned "Következő" notice and moves the week controls above the board; "Tárgyak" is a grid of pinned index cards (`CourseTable`); Határidők has a sticky filter sidebar and a day-strip agenda (`components/week/DayAgenda.tsx`) instead of stacked 7-column boards; a bottom tab bar replaces the top nav below md. Mobile dialogs are bottom sheets with a sticky `DialogActions` row, 16px fields on touch (fixes the iOS zoom that stuck after closing a dialog), and no autofocus on touch except search. See DESIGN.md → Layout, Dialogs.
- **Notice-board surfaces pass**: the deadline detail is the slip itself (`DeadlineDetailDialog` in `components/DeadlineItem.tsx`: state pin, salmon when overdue, labelled actions); the course page is an index card + sections (Határidők agenda, Órák, Anyagok) instead of a week board and tabs; links are launch tiles, edited in a ruled list; Anyagok are pinned notes; settings get a mobile section index, feed cards with sync status, switch groups (`components/ui/Switch.tsx`) and a copy field (`components/ui/CopyField.tsx`, replaces `CodeBlock`); Badge is an outline stamp; mobile Határidők filters live in a sheet. `LinkButton` and `CodeBlock` were removed.
- **Dark theme "after hours"** (on `impeccablelocal`, not yet in `main`): a second token block in `app/tokens.css` on `[data-theme="dark"]` (charcoal felt, grey card slips, chalk ink, inverted primary, darker copy-paper washes, red pin kept). Preference `theme` (system by default, light, dark) is a store device preference applied before paint by `THEME_SCRIPT` in `app/layout.tsx`; sun/moon toggle in the header, three options with board samples in Beállítások → Megjelenés. Hardcoded black washes, shadows and the felt canvas inks are tokens now. See DESIGN.md → After hours.
- **On-screen keyboard**: dialogs are laid out in the visible part of the screen (`components/KeyboardInset.tsx` publishes `--visual-top`/`--visual-height`/`--keyboard-inset` from `visualViewport` for iOS; `interactiveWidget: "resizes-content"` handles Android), the focused field is scrolled back into view when the keyboard opens, the search results shrink to fit, and the mobile tab bar hides while typing (`data-keyboard`).
- **Email digest** (issue #32, branch `impeccablelocal`, not yet in `main`): opt-in napi/heti/havi summary on top of the calendar subscription, sent through Resend from a daily Vercel cron. Double opt-in, one-click unsubscribe, privacy note in settings. The daily mail leads with today (date heading, "Ma" strip with today's classes and time-left bars, "Holnap", overdue, the rest of the week as a ruled list) and is only sent when something is due today or tomorrow. Rendered samples and screenshots: `docs/email-previews/`. **Owner to do before it works in production:** create a Resend account, verify a sender domain, set `RESEND_API_KEY`, `DIGEST_FROM` and `CRON_SECRET` in Vercel (see README). The Hobby plan runs the cron once a day within the hour, which is enough.
- **Accounts, part 1** (branch `impeccablelocal`): sign-in is required (email + password, magic link, confirmed email), data lives on the server as one versioned document per user (`/api/adatok`, compare-and-set, three-way merge on conflict), localStorage is a cache. The calendar subscription and the email digest belong to the account (`/api/fiok/naptar`, `/api/fiok/hirlevel`; no secret, no snapshot upload, no digest confirmation; the rendered `.ics` is cached 15 min and dropped on every save). Existing token/secret subscriptions and digests were abandoned on purpose (two users). Design: `docs/superpowers/specs/2026-10-05-accounts-design.md`, plan: `docs/superpowers/plans/2026-10-05-accounts.md`.
- **Copy**: the Odyssey/nautical copy is gone (notebook-and-blueprint voice, see `PRODUCT.md`), the logo is a notebook icon.

### Decisions a future session needs

- **Dedupe title containment is whole-token** ("zh" is not inside "ropzh 01"), and the shorter side must be at least 2 tokens or 3 characters, **or a single boilerplate word** (so a bare "ZH" still merges with "Diszkrét matematika I ZH"). `findDuplicates`/`applyDedupe` take `courses` (code and name words are stripped from titles). Exam views now match "kviz" too.
- **Calendar routing**: `isNeptunCalendar` decides, by content, whether an imported link/file is a timetable or a deadline feed (no confirm any more). A file that isn't Neptun is rejected with a hint, since feeds need a link to re-sync. A localised Neptun that isn't recognised would be added as a deadline feed.
- **The "Órák" toggle only affects the home board**; the course page always shows that course's classes.
- The fixture `neptun-orarend.ics` has 6 distinct subjects (11 subject/group pairs), not 10.
- Timetable subjects are never matched to Canvas courses automatically (English names, no codes): the user maps them once. Mapping a subject adds its name to the course's `matchKeywords`.


## In progress: course requirements tracker (issue #33)

The full plan (rule schema, grade engine, timetable linking, catch-up popup, reminders, extraction with Jev + a hand-written parser, shared templates per university and subject code, owner answers) is in the project's shared folder, `plans/requirements-tracker/README.md`. Milestones:
- **M0 (done):** a "Követelmények" section on the course page. It holds the requirements as free text (`Course.requirements`, at most 20,000 characters) and the requirement documents (resources of kind `kovetelmeny`, shown here and not under Anyagok).
- **M1 (done, same branch):** rules per course from a template or as validated JSON, result entry per component, the grade engine (current / best / worst, gates, retakes, post steps), the "Mi kell a jegyhez?" solver and the "Ellenőrizd" flags. Rules and results sync with the data document. Not yet: a form-based rule editor (JSON only for now).
- **M2:** timetable linking, the catch-up popup and reminders.
- **M3:** extraction and shared templates.

## Next: accounts part 2, Google and Apple sign-in

OIDC sign-in next to email + password and the magic link. Needs owner decisions and setup:
- approval for the `jose` dependency (ID-token verification);
- a Google Cloud OAuth client (consent screen, redirect URI);
- an Apple Developer account ($99/year), a Services ID, domain verification, and the Apple client secret (a JWT) renewed at least every 6 months;
- account linking rules (same confirmed email → same account).

Capacity notes (free tiers): Upstash 500K commands/month is roughly 250 calendar users with the `.ics` cache (one render per 15 min per view, plus the data and feed caches); Resend allows 100 mails/day, which also bounds sign-up and digest mails.

## Step 0: real iCal fixtures (owner, on their computer)

Status: `canvas.ics` and `neptun-orarend.ics` are in `fixtures/ical/`; `moodle.ics` and `neptun-vizsga.ics` are still missing.

Every item below is easier to build and test against real data. Please add the exports you have to `fixtures/ical/` (see [`fixtures/ical/README.md`](../fixtures/ical/README.md) for naming and what to scrub):

| File | Where to get it | Unblocks |
| --- | --- | --- |
| `canvas.ics` | Canvas → Calendar → "Calendar Feed" link, open it, save the file | dedup, regression tests |
| `moodle.ics` | Moodle → Calendar → Export calendar. **ELTE Moodle has export disabled**; enabling it has been requested from ELTE | dedup, regression tests |
| `neptun-orarend.ics` | Neptun → Órarend / Naptár → export (iCal / .ics), if your Neptun offers it | Neptun timetable import |
| `neptun-vizsga.ics` | the same, for exams (Vizsgák), if separate | dedup with Canvas exams |
| anything else (Teams, TMS, Google) | optional | — |

If Neptun has **no** iCal export, note what it does offer (a CSV or Excel timetable export, a printable page, an "add to Google Calendar" button) in the fixtures README. Plan 2 changes accordingly.

## 3. Shared course feeds (later)

Classmates subscribe to one curated feed per course: a "tárgyfelelős" (course owner) student maintains it, and others subscribe.

Sketch:
- A course can be "published": the server stores a public course snapshot (deadlines and resources only, never personal done or critical state) under a share token.
- Others add it like an iCal feed (`/api/targy/<token>.ics` + JSON); its deadlines merge with `source: "shared"`.
- The owner's write secret works like the subscription secret.
- Moderation and abuse: rate limits like the subscription routes; no free-text pages, only structured data.

This needs an owner decision on privacy wording and on whether this stays accountless.

## 5. Impeccable design skill

The owner wants [Impeccable](https://github.com/pbakaus/impeccable) (design commands `/impeccable audit`, `polish`, `critique`…).
- The cloud agent may not install it: the permission system blocks skill and hook installs.
- The owner installs it on their computer from the repo root:
  ```bash
  npx impeccable install --providers=claude --scope=project
  ```
- Review what it writes to `.claude/`, especially the hooks, then commit and push so cloud sessions get it.
- First use: `/impeccable init` (writes `PRODUCT.md`), then `/impeccable audit` across `/`, `/radar` and `/beallitasok`.

## Known limitations / small follow-ups

- Destructive actions still use the browser's `confirm()`; replace them with a pinned confirmation `Dialog`.

- Neptun exams into dedup once a `neptun-vizsga.ics` fixture exists (the dedupe tests use a synthetic Neptun exam).
- A Neptun URL feed, if Neptun ever offers one (the optional URL import already goes through `/api/ical`).
- `moodle.ics` is still missing (ELTE Moodle has export disabled).
- ~~On the server, "(módosult)" never expires~~ fixed (`chg:<userId>`).
- ~~No automated tests~~ `npm test`.
- `/targy/[id]` hasn't been screenshot-checked since the restyle, and neither has the timetable UI.

## Suggested order

Plans 1, 2 and 4 and the known limitations above shipped. What remains: the moodle/neptun-vizsga fixtures, then Plan 3 (shared feeds) after an owner decision.
