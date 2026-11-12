# Grade alerts: build plan

Spec: `docs/superpowers/specs/2026-10-22-grade-alerts-design.md` (approved 2026-10-22). Read it first; this plan only splits it into phases.

Working tree: branch `nextversion`, uncommitted (the UX work + the `jev` port + docs). A snapshot of the state before this feature is on the local branch `nextversion-jev-port-wip`. Never switch branches, commit, stash, reset or checkout files.

## Rules for every phase

- Follow `CLAUDE.md` / `AGENTS.md` (this Next.js version differs from training data) / `DESIGN.md` (notice board; the Canary Review Rule: checks are canary, red only for real failure).
- i18n: every string in `lib/i18n/hu.ts` (source) and `en.ts`; tracker-related wording can live in `lib/i18n/tracker.*.ts` or `rules.*.ts` like the existing groups. Pure libs take `locale` (default `"hu"`) and stay React-free. Server routes use `errorResponse(locale, code, status)` with new codes in the `errors` group.
- UI from `components/ui/*` (`Switch`, `Checkbox`, `IconButton`, `Button`), type-ramp utilities, tokens only, lucide icons, no new dependencies, `prefers-reduced-motion` respected.
- Demo: no server calls; email parts render `DemoLocked`.
- Tests: `node:test` in `test/`, React/zustand-free imports. End each phase with `npm run lint && npm run build && npm test`, all green.
- Keep `CLAUDE.md` in step: add or update a "Grade alerts" bullet in the phase that adds the thing it describes.
- Report: files changed, decisions, anything unsure.

## Phase 1: alert logic and preferences

- `lib/gradeAlerts.ts`: types (`AlertKind`, `AlertKinds`, `GradeAlert` with `key`, `kind`, `severity`, `courseId`, `text`, `due?`, `urgent`), constants, `gradeAlerts(input, locale)` implementing the four kinds exactly as the spec defines (opportunity via `solveFor` others=`"worst"` and `REACHABLE_SHARE`; risk via `solveFor` others=`"best"` unreachable / others=`"worst"` ≥ `HARD_SHARE`, plus failed/fixable gates; absence from attendance components; change by comparing `evaluate` with and without results updated within `CHANGE_DAYS`), urgency, ordering (danger → warning → info, then due), and `filterAlerts(alerts, kinds)`. Reuse `linkedInstances` / `upcomingAssessments` (`lib/catchup.ts`), `evaluate`, `solveFor`, `courseStanding` wording. Check how `solveFor` targets work (exam id, retake slot id, series id) and map an upcoming assessment's component to its target.
- Wording in the dictionary (both languages): the alert texts with variables, kind names and one-line descriptions (for phase 2's settings).
- `AppData.alertPrefs?: { bell: AlertKinds }` in `lib/types.ts`; `DEFAULT_ALERT_KINDS` (all true); `parseAppData` validates it (drop anything malformed, missing = defaults); the sync merge handles it as a single field (check `lib/sync/merge.ts` for how optional top-level fields like `semester` are merged and follow that); store action `setBellAlertKinds(kinds)`; included in backup export/import and `resetAll`.
- `test/gradeAlerts.test.ts`: every kind with the fixture rules (`lib/rules/fixtures.ts`): opportunity just under and over `REACHABLE_SHARE`, unreachable vs hard pass (and nothing early in the term), absence one/none/over, change with result timestamps inside/outside `CHANGE_DAYS`, urgency (danger and `URGENT_DAYS`), `filterAlerts`, Hungarian and English text, stable keys. Plus a parse/merge test for `alertPrefs`.

## Phase 2: bell and settings (client)

- `lib/reminders.ts` / `components/RemindersMenu.tsx`: the "Figyelem" section becomes the alerts section per the spec (bell kinds, order, cap 6 + "és még N", row layout and icons, link to `/targy/<id>#course-requirements`; make sure that anchor exists and scrolls), badge adds only danger alerts. Remove the old `risks` path if the alerts fully replace it (keep the behaviour of the existing tests or update them deliberately).
- `components/settings/GradeAlertSettings.tsx` in the Értesítések tab (`app/beallitasok/page.tsx`, after the digest settings): the table layout from the spec (kind + description, Csengő and E-mail columns; stacked rows on phones), bell switches wired to `setBellAlertKinds`. The email column is built here but only as UI fed by a small hook `useGradeAlertEmail()` (state: `off | on(kinds) | loading | error | unavailable`) that phase 3 connects to the API; in this phase it may return `off` and keep the email switches disabled. Demo: email column `DemoLocked`. Empty state when no course has rules (link to a course page).
- `components/demo/DemoTour.tsx`: only if a step's target changed.

## Phase 3: server, emails, legal

- `lib/server/gradeAlerts.ts`: `alr:<userId>` record and `alr:index` (see spec), `runGradeAlerts(store, userId, now, appUrl, send?)` (verified email only, loads the document and live deadlines as `lib/server/digest.ts` does, computes alerts, filters by the email kinds, keeps urgent unsent ones, one mail per Budapest day, records keys, prunes after 30 days, removes the entry for a deleted user). Called from `GET /api/cron/hirlevel` for every user in `alr:index`.
- Routes `GET|PUT|DELETE /api/fiok/jegyriaszto` (session, verified email, Origin check via `mutation`, rate limit like the digest; PUT `{ kinds }`, all-false deletes). Connect `useGradeAlertEmail()` and enable the email column.
- `lib/gradeAlertEmail.ts`: the urgent mail, rendered like `lib/digestEmail.ts` (table layout, inlined light tokens, dark tokens, Archivo, account language, text version), with an unsubscribe link `…/hirlevel?m=riaszto&u=<userId>&k=<key>` that only turns alerts off; `POST /api/hirlevel` handles `m=riaszto` (RFC 8058 one-click); the `/hirlevel` page shows the right confirmation. List-Unsubscribe headers like the digest.
- Digest: the "Jegyek" block (after "Rögzítésre vár") only when the user has an `alr:` record, only its email kinds; does not change `shouldSendDigest`.
- Account deletion removes `alr:<userId>` and the index entry (test).
- Legal: privacy purpose "Jegy-figyelmeztetések e-mailben" in both languages, `PRIVACY_UPDATED` → 2026-10-22, record of processing; constants in `lib/legal.ts` if any number appears in the text (30-day key retention).
- Tests: `runGradeAlerts` (sends once per day, no repeat, kinds respected, unverified skipped, deleted user removed), the digest block, the unsubscribe path, routes' validation.
- `CLAUDE.md`: complete the "Grade alerts" bullet (server, routes, cron, emails). `docs/PLAN.md`: a Done entry ("Grade alerts", not yet in main) with owner to-dos.

## Then

Design review by the coordinating agent, then a browser check in the demo (bell + settings; email UI locked) and with a local account if the dev server's memory store allows signing in without real email (check `lib/server/email.ts`: in dev mails are logged; the confirmation link can be read from the server log).
