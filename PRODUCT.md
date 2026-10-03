# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, zustand, ical.js, date-fns, lucide-react. No component libraries; no new dependencies without asking.

## Users and jobs

Hungarian university students juggling one semester across several university systems (Neptun, Canvas, Moodle, Teams, TMS, Discord…). Two jobs carry equal weight:

- **Daily triage:** open the app once or twice a day, see what is due and how urgent it is, tick things off, and jump straight to the right platform link for a course.
- **Setup and upkeep:** at the start of a semester (and occasionally after), add courses, links and resources, connect Canvas/Moodle/iCal feeds, accept discovered courses, and manage the merged calendar subscription, notifications and data.

## What it makes possible

One layer above all the university systems: every course's links, materials and deadlines in one place, plus a single merged calendar that Apple and Google Calendar can subscribe to. Feeds sync automatically and deadlines get matched to courses; urgency is computed, never hand-sorted.

## Constraints and product facts

- All UI text is Hungarian; routes are Hungarian.
- Local-first: no accounts and no login. Data lives in the browser (localStorage). The only server state is the opt-in calendar subscription.
- iCal-sourced deadlines can't be edited or deleted, only marked done or critical.
- Urgency levels: overdue, critical (≤ 48 h or flagged), soon (≤ 7 days), later, done. Weeks start on Monday.
- Features: courses (links, resources, deadlines), feed import and discovery, deadline radar, merged .ics subscription with views, search and quick-add (Ctrl K), browser notifications while a tab is open.
- Not affiliated with Neptun.

## Voice

Wry, warm and nautical: Odyssey and sailing asides in parentheses ("Még üres a fedélzet", "Kösd magad az árbochoz"), always secondary to plain, functional copy.

## Accessibility

Respect `prefers-reduced-motion`. Keep AA contrast for text, and keep everything keyboard-reachable.
