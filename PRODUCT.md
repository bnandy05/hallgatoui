# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, zustand, ical.js, date-fns, lucide-react, pdfjs-dist (reading requirement PDFs in the browser). No component libraries; no new dependencies without asking.

## Users and jobs

Hungarian university students juggling one semester across several university systems (Neptun, Canvas, Moodle, Teams, TMS, Discord…). Two jobs carry equal weight:

- **Daily triage:** open the app once or twice a day, see what is due and how urgent it is, tick things off, and jump straight to the right platform link for a course.
- **Setup and upkeep:** at the start of a semester (and occasionally after), add courses, links and resources, connect Canvas/Moodle/iCal feeds, import the Neptun timetable and map its subjects, accept discovered courses, and manage the merged calendar subscription, notifications, the email digest and the account.

## What it makes possible

One layer above all the university systems: every course's links, materials, deadlines and classes in one place, plus a single merged calendar that Apple and Google Calendar can subscribe to. Feeds sync automatically, deadlines get matched to courses and duplicates across sources are merged; urgency is computed, never hand-sorted. The same data follows the student to every device.

## Constraints and product facts

- The UI is in Hungarian and English (Hungarian first); routes are Hungarian in both.
- Accounts are required: email + password or magic link, with a confirmed email. The server holds one data document per user and is the source of truth; the browser keeps a cache, syncs in the background, merges concurrent edits field by field, and opens offline (installable PWA).
- Opt-in, account-owned extras: the calendar subscription (public read-only token, rendered by the server from the account's data; events link back into the app to mark a deadline done or record a result, and linked tests say what is needed for a grade) and the email digest (daily, weekly or monthly, to the account email).
- GDPR privacy notice at `/adatvedelem` and terms at `/feltetelek`, Hungarian authoritative with an English translation; anything that changes what is stored, for how long or by whom updates them.
- A demo without an account (sample semester, nothing stored on the server) starts from the sign-in page.
- iCal-sourced deadlines can't be edited or deleted, only marked done or critical.
- Urgency levels: overdue, critical (≤ 48 h or flagged), soon (≤ 7 days), later, done. Weeks start on Monday.
- The Neptun timetable (classes) is separate from deadlines: never part of urgency, the radar, notifications or duplicate merging.
- Features: courses (links, resources, deadlines, classes), feed import with Canvas course discovery and auto-linking, Neptun timetable import, deadline radar, duplicate merging across sources, one-off / multi-date / recurring deadlines, merged .ics subscription with views (all, critical, exams, timetable, per course), search and quick-add (Ctrl K / ⌘K), the requirement tracker, the header reminders bell, browser notifications while a tab is open, email digest, light and dark theme.
- Not affiliated with Neptun.

## Requirement tracker

What the student needs for a grade, and where they stand. Each course can carry its grading rules (components, scoring, limits, conditions, retakes), set up from the requirements document, from a template (built-in or shared by students of the same university) or by hand. The student records results as the semester goes (points, grades, attendance per class), and the course page shows each grade's reachable range, the conditions still open, and "what do I need for a 4". Components are tied to the calendar (classes from the Neptun timetable, deadlines from the feeds), so a class or test that ended without a result is asked about in a catch-up popup, in the bell and in the digest.

- The rules decide; the student confirms. Reading a document is a suggestion: the AI (TypeSafe's Jev) only picks answers and numbers from the text, code builds the rules, and every doubtful field waits on Canary paper for the student. Rules that fail validation are never saved.
- Nothing needs the AI: templates and the by-hand form always work, and the privacy notice promises it.
- Computed grades are guidance, not a promise (the terms say so); the course's official rules win.
- Results never sit inside the rules, and a shared template never carries anyone's results or calendar links.

## Voice

Concise, professional Hungarian. Plain functional copy: headings name the thing ("Határidők", "Tárgyak"), controls name their action, errors name the problem and the fix. No jokey asides, no metaphors in UI text, no exclamation marks. Address the student informally (tegező), as Hungarian student tools do.

## Accessibility

Respect `prefers-reduced-motion`. Keep AA contrast for text, and keep everything keyboard-reachable.
