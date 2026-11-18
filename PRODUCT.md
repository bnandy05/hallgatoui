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

## Attendance

Attendance is available on every course, independently of requirements. Course cards show absences, remaining allowance when a limit is confirmed, and how many past classes are unrecorded. The course page starts with a dated, editable attendance history; past timetable classes also have Present / Absent controls. Excused absences, cancelled classes, clearing an answer, Undo, and adding a past class manually are supported. Different timetable subject/group combinations have separate counters.

After-class check-ins default on, start from first activation (no historical popup backlog), and can be disabled globally in Settings → Notifications → Attendance or per course. Switches only control prompts; history stays editable. Unknown attendance never becomes present or absent automatically. Three absences is a suggested limit requiring confirmation; known requirement rules take precedence, including whether excused absences count. Attendance uses the same private result ledger as requirements; linking a requirement transfers matching standalone answers rather than counting them twice. Preferences and records sync and survive backups and semester archiving. Calendar subscription and email attendance summaries are follow-up work; the first release adds controls to the in-app calendar.

## Requirement tracker

What the student needs for a grade, and where they stand. A requirement system can serve one course or explicitly connected lecture/practice/lab courses. Connected courses keep separate pages, timetables, resources, deadlines and attendance. The system has one canonical result ledger and per-component teaching-course assignments; unknown assignments stay unlinked until reviewed. Each course can carry its grading rules (components, scoring, limits, conditions, retakes), set up from the requirements document, from reviewed document imports shared by students at the same university or by hand. The student records results as the semester goes (points, grades, attendance per class), and the course page shows each grade's reachable range, the conditions still open, and "what do I need for a 4". Components are tied to the calendar (classes from the Neptun timetable, deadlines from the feeds), so a class or test that ended without a result is asked about in a catch-up popup, in the bell and in the digest.

- The rules decide; the student confirms. Reading a document is a suggestion: the AI (TypeSafe's Jev) only picks answers and numbers from the text, code builds the rules, and every doubtful field waits on Canary paper for the student. Rules that fail validation are never saved.
- Students can import shared requirements or fill in the form by hand without AI.
- Computed grades are guidance, not a promise (the terms say so); the course's official rules win.
- Results never sit inside the rules, and a shared version never carries anyone's results or calendar links.

## Voice

Concise, professional Hungarian. Plain functional copy: headings name the thing ("Határidők", "Tárgyak"), controls name their action, errors name the problem and the fix. No jokey asides, no metaphors in UI text, no exclamation marks. Address the student informally (tegező), as Hungarian student tools do.

## Accessibility

Respect `prefers-reduced-motion`. Keep AA contrast for text, and keep everything keyboard-reachable.

## Shared requirement systems

Course identity preserves individual official subject codes, section/group numbers, raw imported labels, and an optional lecture/practice/lab type. Legacy comma-separated codes remain readable. Timetable imports never invent missing official codes; matching Canvas metadata or student review can supply them. Multi-code requirement documents and shared-template lookup support every confirmed code.

Reading or importing rules ends with a course-scope review. Students can also connect existing course trackers, select the grading system to use, assign each component/retake to a member course or all members, and explicitly choose conflicting results. Old systems and original results remain as private read-only history. Different scoring definitions are never mixed. Shared grade calculations appear on both course pages, with relevant results first and an All results toggle. Class matching follows explicit component assignments; prompts group by the actual class, while edits use the canonical ledger. Deleting the original owner rehomes a shared system to a surviving course. Backups and semester archives retain memberships and history. Concurrent overlapping joins keep one active system, preserve the other version in history, and request review. Public rule templates omit membership, calendar links and all private history/results.
