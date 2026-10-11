# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, zustand, ical.js, date-fns, lucide-react. No component libraries; no new dependencies without asking.

## Users and jobs

Hungarian university students juggling one semester across several university systems (Neptun, Canvas, Moodle, Teams, TMS, Discord…). Two jobs carry equal weight:

- **Daily triage:** open the app once or twice a day, see what is due and how urgent it is, tick things off, and jump straight to the right platform link for a course.
- **Setup and upkeep:** at the start of a semester (and occasionally after), add courses, links and resources, connect Canvas/Moodle/iCal feeds, import the Neptun timetable and map its subjects, accept discovered courses, and manage the merged calendar subscription, notifications, the email digest and the account.

## What it makes possible

One layer above all the university systems: every course's links, materials, deadlines and classes in one place, plus a single merged calendar that Apple and Google Calendar can subscribe to. Feeds sync automatically, deadlines get matched to courses and duplicates across sources are merged; urgency is computed, never hand-sorted. The same data follows the student to every device.

## Constraints and product facts

- All UI text is Hungarian; routes are Hungarian.
- Accounts are required: email + password or magic link, with a confirmed email. The server holds one data document per user and is the source of truth; the browser keeps a cache, syncs in the background, merges concurrent edits field by field, and opens offline (installable PWA).
- Opt-in, account-owned extras: the calendar subscription (public read-only token, rendered by the server from the account's data) and the email digest (daily, weekly or monthly, to the account email).
- Hungarian GDPR privacy notice at `/adatvedelem`; anything that changes what is stored or for how long updates it.
- iCal-sourced deadlines can't be edited or deleted, only marked done or critical.
- Urgency levels: overdue, critical (≤ 48 h or flagged), soon (≤ 7 days), later, done. Weeks start on Monday.
- The Neptun timetable (classes) is separate from deadlines: never part of urgency, the radar, notifications or duplicate merging.
- Features: courses (links, resources, deadlines, classes), feed import with Canvas course discovery and auto-linking, Neptun timetable import, deadline radar, duplicate merging across sources, one-off / multi-date / recurring deadlines, merged .ics subscription with views (all, critical, exams, timetable, per course), search and quick-add (Ctrl K / ⌘K), the header reminders bell, browser notifications while a tab is open, email digest, light and dark theme.
- Not affiliated with Neptun.

## Voice

Concise, professional Hungarian. Plain functional copy: headings name the thing ("Határidők", "Tárgyak"), controls name their action, errors name the problem and the fix. No jokey asides, no metaphors in UI text, no exclamation marks. Address the student informally (tegező), as Hungarian student tools do.

## Accessibility

Respect `prefers-reduced-motion`. Keep AA contrast for text, and keep everything keyboard-reachable.
