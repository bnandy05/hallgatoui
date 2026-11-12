# Grade alerts (bell + email)

Status: draft for the owner's OK (2026-10-22). Builds on the requirement tracker (`lib/rules/*`, `lib/catchup.ts`, `lib/reminders.ts`, `lib/digest.ts`).

## Goal

Tell the student, in the bell and by email, when their grade is about to move: a better grade is within reach, a grade (or passing at all) is at risk, the absence limit is close, or a recorded result settled or changed the grade. The bell shows all four kinds by default; email is opt-in. Each kind has its own switch per channel (bell and email).

## Alert kinds

All four are computed by one pure function, `gradeAlerts(input, locale)` in a new `lib/gradeAlerts.ts` (React-free, used by the bell and the server), from the rules, the results, the linked calendar instances (`linkedInstances`, `upcomingAssessments` in `lib/catchup.ts`) and `now`. Each alert has a stable `key` (for de-duplication), a `kind`, a `severity` (`info` | `warning` | `danger`), the course, the text (localised), and an optional `due` (the assessment it hinges on).

Constants (in `lib/gradeAlerts.ts`, so they can be tuned): `LOOKAHEAD_DAYS = 14`, `REACHABLE_SHARE = 0.8`, `HARD_SHARE = 0.7`, `CHANGE_DAYS = 7`, `URGENT_DAYS = 2`.

1. **Better grade in reach** (`opportunity`, info). For each outcome that is not final, and each assessment due within `LOOKAHEAD_DAYS` that is linked to one of its exams, retakes or series (`upcomingAssessments`): ask `solveFor` (others = `"worst"`, i.e. "for sure") for the highest grade above the current secured grade (`worst`) whose needed score is at most `REACHABLE_SHARE` of the maximum. Alert: "A 2. zh-n 24/40 pont kell a 4-eshez" / "24/40 on Midterm 2 gets you a 4". Only the best such grade per assessment; nothing when the needed score is above the share (that is not "close").
2. **Grade at risk** (`risk`). Any of:
   - passing (the outcome's lowest passing grade, 2) is `unreachable` by `solveFor` with others = `"best"` → danger: "Az Analízis I. gyakorlati jegye már nem teljesíthető" (only once the rules say so, never early in the term: an unrecorded future is never "unreachable" under best case);
   - passing needs at least `HARD_SHARE` of the maximum on an assessment within `LOOKAHEAD_DAYS` (others = `"worst"`) → warning: "A ketteshez 34/40 kell a pótzh-n";
   - a condition is `failed` (danger) or only `fixable` (warning): the existing `courseStanding` risk wording.
3. **Absence limit** (`absence`). From the attendance components (as `courseStanding` does): one left → warning, none left or over → danger. Wording reused from `t.rules.standing`.
4. **Grade settled or changed** (`change`, info, or warning when it got worse). Pure and stateless: compare `evaluate` with all results against `evaluate` without the results whose `updatedAt` is within `CHANGE_DAYS`. Alert when the outcome became final ("Végleges: 4"), the secured grade rose ("A 3-as már biztos"), or the best reachable grade fell ("Az 5-ös már nem érhető el", warning). Shown for `CHANGE_DAYS` after the result, so the bell and the server agree without storing anything.

An alert is **urgent** when it is danger, or when the assessment it hinges on is within `URGENT_DAYS`. Courses without rules produce nothing; demo data works (pure, client-side).

## Preferences

Two channels, each with its own four switches (one per kind), so a student can, for example, get grade news by email but no absence mails.

- **Bell: on by default.** `AppData.alertPrefs?: { bell: AlertKinds }` with `AlertKinds = { opportunity: boolean; risk: boolean; absence: boolean; change: boolean }`, all `true` by default (missing = all on; synced so every device shows the same; merged latest-edit-wins; validated in `parseAppData`). Turning a kind off hides it from the bell and its badge.
- **Email: off by default, opt-in.** Account-owned and server-side like the digest: `alr:<userId>` = `{ kinds: AlertKinds, unsubscribeKey: string, sent: Record<alertKey, ISO>, lastUrgentDay?: string }` plus the `alr:index` set; no record = email off. Turning email on stores the record with all four kinds on, and the student then switches off what they don't want; a kind that is off produces nothing by email (no urgent mail and no row in the digest's "Jegyek" block), and when all four are off the record is deleted (email off). Routes `GET|PUT|DELETE /api/fiok/jegyriaszto` (session, verified email, `errorResponse(locale, code, status)`; `PUT { kinds }`). Deleting the account deletes it. In the demo the email part renders `DemoLocked`; the bell switches still work.

UI: a "Jegy-figyelmeztetések" / "Grade alerts" group in Beállítások → Értesítések (`components/settings/GradeAlertSettings.tsx`), laid out as one table of the four kinds (each with a one-line description) and two columns of switches, "Csengő" / "Bell" (on) and "E-mail" / "Email" (off until enabled); on phones each kind is a row with both switches under its description. Above the email column: "E-mail küldése" / "Send emails" (the opt-in, off by default, with the account address and one line on what is sent: urgent alerts at most once a day, plus a "Jegyek" block in the digest if you get one); the email column's switches are disabled until it is on. When no course has rules, the group says so and links to a course page.

## Bell

`buildReminders` gets the alerts (filtered by the bell kinds). The existing "Figyelem" section becomes the alerts section, ordered danger → warning → info, then by due date; at most 6 rows, then "és még N". Each row: course name in Fine Muted Ink, the alert text in Small, and the due date when there is one; danger text in Danger Red, warning in Warning, opportunity and settled in ink with a small lucide icon (TrendingUp for opportunity, CheckCircle2 for settled, TrendingDown when worse, AlertTriangle for risk/absence). A row links to the course page's requirements section (`/targy/<id>#course-requirements`). The badge adds danger alerts only (as today's severe risks), so a good-news alert never nags.

## Email

1. **Digest block "Jegyek" / "Grades"** (only when email is on, and only the kinds switched on for email): in daily, weekly and monthly digests, after "Rögzítésre vár", the current alerts (same order and cap) as ruled rows on a paper block, with a link to the app; danger rows carry the red stamp, opportunities the canary paper strip. Its presence alone does not make a daily digest worth sending (`shouldSendDigest` unchanged), so it rides along.
2. **Urgent mail "Jegy-figyelmeztetés: …"** (only with the opt-in): the daily cron (`/api/cron/hirlevel`) also runs `runGradeAlerts(store, userId, now, appUrl)` (`lib/server/gradeAlerts.ts`) for users in `alr:index`: it loads the data document and live deadlines like the digest, computes alerts, keeps the urgent ones of the email kinds whose key is not in `sent` (or was sent more than 7 days ago and has changed severity), and sends at most one mail per Budapest day (`lastUrgentDay`) listing them. Keys are recorded in `sent` (pruned after 30 days). Rendered in `lib/gradeAlertEmail.ts` like the digest (notice-board table layout, inlined light tokens, dark tokens under `prefers-color-scheme`, account language, unsubscribe link that turns only the alerts off: `/hirlevel?m=riaszto&u=…&k=…`, RFC 8058 one-click via `POST /api/hirlevel` with `m=riaszto`).

Resend budget: at most one alert mail per user per day, plus the digest.

## Privacy and terms

New purpose in `lib/privacy.ts` (both languages, `PRIVACY_UPDATED`): "Jegy-figyelmeztetések e-mailben" — data: the chosen alert kinds, the computed alerts from the student's rules and results, and the sent keys; basis: consent (Art. 6(1)(a)), withdrawable in settings or by the mail's link; kept until turned off or the account is deleted (sent keys 30 days). Record of processing updated. No new processor (Resend already listed). Terms: no change (grades are already guidance only).

## Tests

`test/gradeAlerts.test.ts` on the four kinds and the per-channel kind filters with the fixture rules (`lib/rules/fixtures.ts`): an opportunity under/over `REACHABLE_SHARE`, unreachable vs hard pass, absence one/none/over, change detection with result timestamps inside/outside `CHANGE_DAYS`, urgency, kind filtering, Hungarian and English text. `test/digest.test.ts`: the "Jegyek" block only with email on, only the email kinds. A server test for `runGradeAlerts`: once per day, no repeat of a sent key, unverified user skipped, account deletion removes `alr:`.

## Out of scope

Push notifications, per-course alert settings, browser notifications for alerts, alerts for courses without rules, changing thresholds in the UI.
