# Roadmap

The working plan for Hallgatói réteg. It lives in the repo so every session (human or agent) starts from the same list. Update it when something ships or the plan changes.

Conventions for all work: see [`CLAUDE.md`](../CLAUDE.md). The process: an agent writes a brief, a subagent implements it, the agent reviews it and pushes to a `claude/*` branch, and the owner tests the Vercel preview and merges. The sandbox can't reach `*.vercel.app`, so testing on the deployed site is always the owner's job.

## Done (in `main`)

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

## Step 0: real iCal fixtures (owner, on their computer)

Every item below is easier to build and test against real data. Please add the exports you have to `fixtures/ical/` (see [`fixtures/ical/README.md`](../fixtures/ical/README.md) for naming and what to scrub):

| File | Where to get it | Unblocks |
| --- | --- | --- |
| `canvas.ics` | Canvas → Calendar → "Calendar Feed" link, open it, save the file | dedup, regression tests |
| `moodle.ics` | Moodle → Calendar → Export calendar (all events, recent and next 60 days) | dedup, regression tests |
| `neptun-orarend.ics` | Neptun → Órarend / Naptár → export (iCal / .ics), if your Neptun offers it | Neptun timetable import |
| `neptun-vizsga.ics` | the same, for exams (Vizsgák), if separate | dedup with Canvas exams |
| anything else (Teams, TMS, Google) | optional | — |

If Neptun has **no** iCal export, note what it does offer (a CSV or Excel timetable export, a printable page, an "add to Google Calendar" button) in the fixtures README. Plan 2 changes accordingly.

## 1. Duplicate removal across sources

**Problem:** the same exam or deadline arrives from several sources (Neptun exam and Canvas assignment, or the Canvas and Moodle copies of the same course), so it appears twice in the radar and the subscribed calendar.

**Approach:**
- A pure `lib/ical/dedupe.ts`: `findDuplicates(deadlines, courses) → DuplicateGroup[]`. Two open deadlines are candidates when:
  - they come from different feeds (or one feed and one manual entry);
  - they resolve to the same course;
  - their due times are within a window (same Budapest day; ±1 hour if both have times);
  - their normalised titles are similar: accent-insensitive via `normalizeSearch`, with course code and boilerplate words ("beadandó", "assignment", "ZH", brackets) stripped, then token overlap ≥ 0.6, or one title contains the other.
- **Display rule:** one primary per group, chosen by source priority (manual > Canvas > Moodle > Neptun > other, tunable), with the others marked `duplicateOf: <primaryId>` (computed, not stored, so it recomputes after every sync).
  - The radar shows the primary with a small "+1 forrás" (one more source) pill that expands to the other sources' links.
  - `buildCalendar` emits only the primary. Its description lists all sources' links.
- **User control:**
  - "Nem duplikátum" ("not a duplicate") on a group, stored as a pair key in `ignoredDuplicatePairs` in `AppData`;
  - marking the primary done or critical applies to the whole group.
- Server side, the same function runs inside `GET /api/naptar/[token]` after `mergeFeedSync`, so phones see the deduped view.
- **Tests:** table-driven cases from the fixtures (same exam in Neptun and Canvas, two similarly named but different assignments that must not merge, and so on).

**Open questions for the owner:**
- Which source should win by default?
- Should dedup be on by default? Suggested: yes, with a toggle in Beállítások → Naptár.

## 2. Neptun timetable import

**Depends on Step 0.** Two paths:

- **(a) Neptun has an iCal export or link.**
  - Treat it as a feed with `platformId: "neptun"`.
  - Add a feed kind so timetable events (classes, recurring) are kept apart from deadlines: a new `ClassSession` type, or `Deadline.kind = "ora"`, decided after seeing the file.
  - Recurring events (`RRULE`, `EXDATE`) need expanding: ical.js supports this, so cap it at the semester.
  - Course matching uses the subject code in the summary (Neptun puts e.g. `BMEVIIIAA01` in the title or description).
  - Discovery reuses `lib/ical/discover.ts`: create courses from Neptun subjects, like Canvas.
  - UI:
    - a weekly timetable view on `/` or a new `/orarend` page ("Órarend");
    - the next class on each course card;
    - classes in the merged calendar as their own view (`?nezet=orarend`), off by default in "összes", because the user's calendar may already have them.
- **(b) No iCal: a file or paste import.**
  - The user uploads the export Neptun does offer (Excel or CSV) or pastes the timetable table.
  - A pure parser creates the same `ClassSession` records, which are static and re-imported each semester.

Either way, Neptun exam dates feed into Plan 1's dedup.

## 3. Shared course feeds (later)

Classmates subscribe to one curated feed per course: a "tárgyfelelős" (course owner) student maintains it, and others subscribe.

Sketch:
- A course can be "published": the server stores a public course snapshot (deadlines and resources only, never personal done or critical state) under a share token.
- Others add it like an iCal feed (`/api/targy/<token>.ics` + JSON); its deadlines merge with `source: "shared"`.
- The owner's write secret works like the subscription secret.
- Moderation and abuse: rate limits like the subscription routes; no free-text pages, only structured data.

This needs an owner decision on privacy wording and on whether this stays accountless.

## 4. Copy: drop the Odyssey theme

The UI copy still uses the Odyssey and ship metaphor:
- "egy fedélzeten", "Még üres a fedélzet", "A te hajód…";
- the Odüsszeusz and sziréna (siren) footnotes;
- the sailboat logo icon.

Rewrite it in the school, notebook and blueprint voice so the site no longer reads as an Odysseus copy. Keep the dry humour in the small footnotes. Small and self-contained; a good next quick win.

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

- On the server, "(módosult)" stays until the site is opened again: the 48-hour window starts from the browser's last sync. Fix: store `dueChangedAt` from the server's own `mergeFeedSync` in a small per-token KV record.
- There are no automated tests yet: logic was verified with ad-hoc scripts. After Step 0, add a minimal test runner (Node's built-in `node:test` via `tsx` or similar, which needs owner approval for a dev dependency) with fixture-based tests for `parseIcs`, `mergeFeedSync`, `buildCalendar` and dedup.
- `/targy/[id]` hasn't been screenshot-checked since the restyle.

## Suggested order

1. Step 0 (owner adds the fixtures).
2. Plan 4 (copy rewrite) while the fixtures are being collected.
3. Plan 1 (dedup) with fixture tests.
4. Plan 2 (Neptun), path (a) or (b) depending on the export.
5. The "(módosult)" server fix and the test runner.
6. Plan 3 (shared feeds) after an owner decision.
