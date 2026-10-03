# Brief: roadmap implementation (fixes + tests, dedup, server "módosult", Neptun timetable, copy)

Implements Plans 1, 2 and 4 and the "Known limitations" of [`docs/PLAN.md`](../PLAN.md). Read `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md` and `docs/PLAN.md` first. The project conventions in `CLAUDE.md` are binding (Hungarian UI, English code, tokens only, `components/ui/*`, no new dependencies, Budapest helpers for exports, SSRF rules).

## Process

- Work **one phase at a time**, in order. Stop after each phase and report: files changed, decisions you took that this brief didn't settle, anything you couldn't verify.
- At the end of every phase run `npm run lint && npm run build` (and from Phase 1 on also `npm test`) and fix everything. Report the results.
- **Never commit, push or create branches.** The owner commits.
- Don't add dependencies (runtime or dev). Node is v24.
- Next.js here is v16 with breaking changes: check `node_modules/next/dist/docs/` before touching routes or config.
- Keep pure logic in `lib/` (no React, zustand or `window`) so it is testable with `node --test`.
- Data fixtures: `fixtures/ical/canvas.ics` (34 Canvas events) and `fixtures/ical/neptun-orarend.ics` (144 classes + 5 holidays). `fixtures/ical/README.md` describes their quirks. Read it.

## Phase 1: test runner, Budapest all-day fix, fixture tests

### 1a. Dependency-free test runner

Node 24 strips TypeScript types natively. The only missing pieces are the `@/` alias and extensionless imports. This recipe was verified to work in this repo:

`test/alias-loader.mjs`
```js
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
```

`test/alias-hooks.mjs`
```js
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
// Resolves "@/x" to <repo>/x and adds the .ts/.tsx extension Next's bundler would infer.
export async function resolve(spec, ctx, next) {
  let target = spec;
  if (spec.startsWith("@/")) target = new URL(spec.slice(2), root).href;
  if ((target.startsWith("file:") || target.startsWith(".")) && !/\.[cm]?[jt]sx?$/.test(target)) {
    const base = target.startsWith(".") ? new URL(target, ctx.parentURL).href : target;
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, ctx);
    }
  }
  return next(target, ctx);
}
```

`package.json` script (TZ=UTC on purpose: the server runs in UTC, and that is where the time-zone bugs hide):
```json
"test": "TZ=UTC node --import ./test/alias-loader.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \"test/**/*.test.ts\""
```

Make sure `next build` (type-check) and `eslint` are happy with `test/` (`.mjs` files and `*.test.ts` importing `node:test`). Exclude `test/` from the Next type-check only if you really need to. Tests may only import modules free of `"use client"`, React and zustand. If a pure function you need lives in `lib/store.ts`, move it into its own module.

Add a small `test/fixtures.ts` helper: `readFixture(name)` reads `fixtures/ical/<name>`.

### 1b. Bug: all-day events are pinned in the runtime's time zone

`lib/ical/parse.ts` turns an all-day `DTSTART` into `jsDate.setHours(23, 59)`, which runs in the **runtime's local** zone. In the browser (Budapest) that is right. On the server (UTC, `GET /api/naptar/[token]` re-parses feeds) it yields 23:59 UTC = 01:59 the next day in Budapest. Because the snapshot holds the browser's value, the server's `mergeFeedSync` also sees a due change on every request, so a false "(módosult)" shows up.

Fix: add a pure `budapestInstant(date: YMD, hour: number, minute: number): Date` to `lib/ical/budapest.ts`. It returns the UTC instant of that Budapest wall-clock time and must handle CET/CEST, for example by guessing UTC, comparing with `budapestParts` and correcting the offset. Use it in `parseIcs` with the ical.js date's year/month/day. Canvas sends `DTSTART;VALUE=DATE:20260911T000000`; ical.js already reads that as a date (`isDate`). Keep that working.

Grep for other `setHours` / `startOfDay` / local-time use in code that runs on the server (`lib/ical/*`, `lib/server/*`) and fix it the same way. Client-only UI code may keep using local time.

### 1c. Fixture tests (`test/*.test.ts`)

- `parse.test.ts`: `canvas.ics` → 34 events. "Otthoni kvíz 01" is due `2026-09-13T21:59:00.000Z` (23:59 CEST). `event-assignment-override-79658` keeps its exact time (`2026-09-14T18:00:00.000Z`). `neptun-orarend.ics` parses to 149 events despite the blank lines. Add a winter-time case (a December all-day event → 22:59Z).
- `canvas.test.ts`: contexts discovered from `canvas.ics`: 6 contexts, and the Ea/Gy variants of "Diszkrét matematika I" and "Algoritmusok és adatszerkezetek I" share a `groupKey` (note the trailing dot in "I." on some labels). Clean titles of override events strip both the `(…)` part and the `[…]` part ("Beadandó 01").
- `sync.test.ts`: `mergeFeedSync` with `canvas.ics` keeps `done`/`critical`/`courseId` across a re-sync; a moved due date sets `previousDue`/`dueChangedAt`; future events missing from the feed are dropped while past ones are kept; `markDoneBefore` works.
- `export.test.ts`: `buildCalendar` with a few deadlines produces a parsable .ics (parse it back with `parseIcs`), UIDs derive from `feedId` + `externalUid`, the views filter as documented, and the weekly summary falls on Budapest Mondays.

## Phase 2: duplicate removal (Plan 1)

Settled owner decisions: **on by default**, toggle in Beállítások → Naptár-előfizetés (or wherever the export options live). Source priority: **manual > canvas > moodle > neptun > anything else**.

### Pure logic: `lib/ical/dedupe.ts`

- `deadlineSourceKey(d, feeds)` → `"manual"` or the feed's `platformId` (`canvas`, `moodle`, `neptun`, custom…).
- `deadlineIdentity(d)`: a **stable** identity: `ical:<feedId>:<externalUid>` for feed deadlines, `manual:<id>` for manual ones (ids of new feed deadlines on the server are random per request, so never use `id` for feed deadlines).
- `pairKey(a, b)`: the two identities sorted and joined with `|`.
- `findDuplicates(deadlines, feeds, ignoredPairs) → DuplicateGroup[]` where `DuplicateGroup = { primary: Deadline; others: Deadline[] }`. Two deadlines are candidates when **all** of these hold:
  - they don't come from the same feed (two manual deadlines are never merged either; manual + feed is fine);
  - both have the same non-null `courseId`;
  - they fall on the same Budapest date (`budapestDate`). If neither is an all-day deadline (all-day = Budapest 23:59), they must also be within ±60 minutes of each other;
  - their titles are similar: run `normalizeSearch`, remove bracketed and parenthesised parts, the course's `code`, words of the course `name`, and boilerplate (`beadando`, `assignment`, `hazi`, `feladat`, `hw`, `homework`, `zh`, `zarthelyi`, `vizsga`, `exam`, `quiz`, `kviz`, `teszt`, `test`), then tokenise. They match when token overlap / min(size) ≥ 0.6, or one normalised title contains the other. **Guard:** if both titles contain numbers and their number sets differ, they are not duplicates ("Beadandó 02" ≠ "Beadandó 03"). If either token set is empty after stripping, fall back to comparing the full normalised titles for equality;
  - their pair key is not in `ignoredPairs`.
  Build groups transitively (union-find). Pick the primary by source priority, then by the earliest `due`, then by identity, so the choice is deterministic. Groups are computed, **never stored**.
- `applyDedupe(deadlines, feeds, ignoredPairs, enabled) → { visible: Deadline[]; extras: Map<string /* primary id */, Deadline[]> }`. The primary's `done`/`critical` count for the group.

### Data

- `AppData.ignoredDuplicatePairs: string[]`, an optional/defaulted field: default to `[]` in the store `merge` on hydration, in `emptyAppData`, in `importData` validation (`lib/importData.ts`), and in the demo data. Also add it to `CalendarSnapshot`, `buildSnapshot` and `validateSnapshot` (array of strings, cap the length, e.g. 2000).
- `ExportOptions.dedupe: boolean`, default `true` in `DEFAULT_EXPORT_OPTIONS`, in the hydration `merge` and in `validateSnapshot`. It also governs the in-app lists, so document that next to the type.
- Store actions: `ignoreDuplicate(aId, bId)` (adds the pair key), `clearIgnoredDuplicates()`. `toggleDone` and the critical toggle on a **primary** apply the same value to every member of its group (compute the group with `findDuplicates` inside the action).

### UI

- One memoised hook, e.g. `lib/useDedupedDeadlines.ts` (client), returns `{ visible, extras }`. Use `visible` everywhere deadlines are listed or counted: home `WeekBoard` + `weekSummary` + next-week count, `/radar`, the course page, `CourseTable` (next deadline, open count), `NotificationScheduler` (no double notifications) and the command palette search (search the visible list).
- `DeadlineChip` / `DeadlineItem`: when the primary has extras, show a small `Pill` "+N forrás". Clicking it expands, inline or as a popover built from existing primitives, a list of the other copies: platform icon + platform name + link (the deadline's `url`) + a "Nem duplikátum" button that calls `ignoreDuplicate(primary.id, other.id)`.
- Settings: a checkbox "Duplikátumok összevonása" (with a one-line explanation: the same deadline from several sources appears once, in the app and in the calendar) plus, when `ignoredDuplicatePairs.length > 0`, a "Kivételek törlése (N)" button.

### Calendar

- `buildCalendar` takes `ignoredDuplicatePairs` + `feeds` (or the precomputed groups) and, when `options.dedupe`, emits only primaries. The primary's DESCRIPTION gets a "Források:" block listing every copy's platform name and URL. This covers both the download and the subscription. In `renderSubscription`, dedup happens after all `mergeFeedSync` calls (pass `sub.snapshot.ignoredDuplicatePairs`).

### Tests (`test/dedupe.test.ts`), table-driven

- Canvas "Beadandó 01" + a manual "Beadandó 1" for the same course and day → **merge** (normalise numbers by stripping leading zeros before the number guard), manual is primary.
- The same exam from a `neptun` feed ("Diszkrét matematika I ZH") and from Canvas ("ZH [..Diszkrét matematika I..]"), same day, 30 min apart → merge, Canvas is primary.
- "röpZh 01" and "Röp zh 01_ 2. kérdés" from the **same** feed → never merge.
- "Beadandó 02" vs "Beadandó 03" from different feeds, same day → no merge (number guard).
- Same title, different courses → no merge; same title, different Budapest days → no merge.
- An ignored pair → no merge; three-way group → one primary, two others; priority order respected.
- `buildCalendar` with dedupe on/off → VEVENT count differs as expected and the primary's description lists both sources.

## Phase 3: server-side "(módosult)" fix

Problem (from `docs/PLAN.md`): on the server the 48 h "(módosult)" window starts from the browser's last sync. If the browser hasn't synced, the server's `mergeFeedSync` sets `dueChangedAt = now` on **every** request, so the marker never expires.

- Pure function in `lib/server/dueChanges.ts` (no KV inside): `trackDueChanges(record: DueRecord | null, deadlines: Deadline[], now: Date) → { deadlines: Deadline[]; record: DueRecord; changed: boolean }`, where `DueRecord = Record<identity, { due: string; previousDue?: string; changedAt?: string }>` keyed by `deadlineIdentity` (feed deadlines only).
  - With no record entry, seed it from the deadline itself: `due`, and the deadline's own `previousDue`/`dueChangedAt` as they came **from the snapshot**. Seed it from the snapshot's version of the deadline, not the server's merged one. So compute the record against the snapshot deadlines first, or pass both lists in; design it so a first request never invents a change.
  - When the merged `due` differs from `record.due` → `previousDue = record.due`, `changedAt = now`, and update the entry.
  - The output deadlines take `previousDue`/`dueChangedAt` from the record, overriding whatever `mergeFeedSync` set. Entries for identities no longer present are pruned.
- `renderSubscription`: load `chg:<token>` from KV, apply after the merges and before dedup/`buildCalendar`, and write back only when `changed` (same TTL). Add the key helper next to `srcKey`, and delete it in `DELETE /api/naptar/[token]` and wherever the subscription is rotated or removed.
- Tests: first request with a stale snapshot → no false change; a real move → marker set at that request's `now` and still set 47 h later; after 49 h `isRecentlyChanged` is false although the snapshot is still stale; entries prune.

## Phase 4: Neptun timetable (Plan 2)

What the real export looks like (see the fixtures README): a **static file**, single events (no RRULE), UTC times, `SUMMARY = "<subject> ( - <group>) - <teachers ;-sep> - <type>"`. Types: `Lesson` (classes) and `Other event` (holidays: `Szünnap/szünet ( - <name>) - Other event`, zero length at Budapest midnight). A Hungarian Neptun UI probably says `Tanóra`/`Óra`, `Vizsga`, `Egyéb esemény`; accept those too. Subject names may be English and carry no code, so **automatic matching to Canvas courses is not possible** and the user maps subjects once.

### Types (`lib/types.ts`)

```ts
export type SessionKind = "ora" | "vizsga" | "szunnap" | "egyeb";

export interface ClassSession {
  id: string;
  sourceId: string;          // TimetableSource.id
  externalUid: string;       // VEVENT UID
  kind: SessionKind;
  subject: string;           // raw subject name ("Discrete mathematics I"), holiday name for szunnap
  subjectKey: string;        // normalizeCourseName(subject), the mapping key
  group?: string;            // "4"
  teachers: string[];
  location?: string;         // full LOCATION
  room?: string;             // short code in the trailing parentheses: "LD-0-821-01-11"
  start: string;             // ISO
  end: string;               // ISO (== start for holidays)
  courseId: string | null;
}

export interface TimetableSource {
  id: string;
  name: string;              // "Neptun órarend"
  url?: string;              // only when added by URL (re-fetchable through /api/ical)
  importedAt: string;
  subjectCourses: Record<string, string | null>; // subjectKey → courseId (null = skipped)
}
```

`AppData` gets `classSessions: ClassSession[]` and `timetableSources: TimetableSource[]`, defaulted everywhere like `ignoredDuplicatePairs` (hydration merge, `emptyAppData`, `importData`, `resetAll`, demo). Deleting a course sets its sessions' `courseId` to null and removes it from `subjectCourses`.

### Pure parsing: `lib/ical/neptun.ts`

- `parseNeptunEvents(events: IcalEventDTO[]) → ParsedSession[]`. `IcalEventDTO` currently has no `end`/`location`, so extend `parseIcs` to also return `end` (ISO; for all-day, the end of that Budapest day or simply equal to start) and `location`, without changing any existing behaviour. Parse the summary right-to-left: the type is the last ` - ` segment, then the teachers segment, then `<subject> ( - <group>)`. Be tolerant: if the pattern doesn't match, `subject = summary`, `kind = "egyeb"`. Room = the last `(…)` of LOCATION if it looks like a code.
- `isNeptunCalendar(text or events)`: heuristic used by the import UI to tell the user they picked a wrong file (e.g. `X-WR-CALNAME:Neptun` or most summaries end in a known type).
- `mergeTimetableImport(source, parsed, existing sessions)`: replace that source's sessions, keep `courseId` from `source.subjectCourses`, and upsert by `externalUid`.
- `nextSessionFor(courseId, sessions, now)`, `sessionsInWeek(sessions, weekStart)` / a day bucketing helper next to `bucketWeekByDay` (client local time is fine in UI helpers).
- `suggestCourseForSubject(subject, courses)`: normalised exact or `matchCourseInText` hit, else null. It rarely fires for English names; that's expected.

### Import flow (Beállítások → Naptárak tab, own component `components/settings/TimetableSettings.tsx`)

- A card "Neptun órarend" with copy explaining where to get the file in Neptun (Naptár → Exportálás → .ics) and that the file is processed in the browser.
- File input `accept=".ics,text/calendar"` (read with `file.text()`, parse locally, **no upload**). Optionally a URL field that fetches through the existing `/api/ical` proxy (same as feeds).
- After parsing, open a mapping dialog (`components/ui/Dialog.tsx`; it mounts children only while open, so initialise state from props). Per subject: name, group(s), number of classes, and a select: one of the existing courses (pre-selected from `suggestCourseForSubject` or a previous `subjectCourses` entry) / "Új tárgy létrehozása" / "Kihagyás". Creating a new course uses `pickCourseColor`, the subject as the name, and adds a Neptun platform link only if we have a URL (we don't; skip it). When mapping to an existing course, add the subject name to its `matchKeywords` if it isn't already in them. Holidays don't need mapping.
- The card lists imported sources: name, number of classes, date range, import date, and the actions "Újraimportálás" (file again; the mapping is reused, only new subjects ask), "Hozzárendelés szerkesztése" and "Törlés".

### Display

- **Home `WeekBoard`**: classes of that week appear in their day as compact, visually secondary chips (outlined, dimmer than deadline chips, time range `10:00–12:00`, course colour dot, short subject/course name, room code). Sorted by start, classes above deadlines or merged by time; your call, keep it readable. A small toggle in the home header ("Órák" on/off, persisted in the store as a device preference, **not** in AppData, default on when there are sessions). Holidays: the day header shows "Szünnap" + the name, and the column gets a subtle tint (token colours only). Mobile day-list mode must keep working.
- **Course page** (`CourseWeekDetail`): its week strip shows that course's classes. The header shows "Következő óra: <day> <time>, <room>".
- **`CourseTable`**: the next class under or next to the next deadline (compact, hidden on narrow screens if space is tight).
- Unmapped subjects (`courseId: null`): shown with a neutral dot and the raw subject, and a `DiscoveryBanner`-like nudge to map them.
- Classes are **not** deadlines: they never touch urgency, `weekSummary`, notifications, the radar or dedup.

### Calendar export

- New view `?nezet=orarend` in `lib/ical/views.ts` (`{ kind: "timetable" }`): only class sessions (timed VEVENTs with LOCATION and the teachers in DESCRIPTION) + holidays as all-day transparent events.
- `ExportOptions.includeClasses: boolean`, default **false**: when true, "összes" and `targy-<id>` also contain the classes (course view: only that course's). Default it in the hydration merge and `validateSnapshot`.
- Session UIDs derive from `sourceId` + `externalUid` (same rule as deadlines), and use `DTSTART`/`DTEND` in UTC. Holiday all-day dates use the Budapest helpers.
- The snapshot carries `classSessions` (cap e.g. 1500, validated shape) and `timetableSources` are **not** needed server-side. The server doesn't re-fetch timetables.
- The view picker in `CalendarSubscriptionSettings` gets the "Órarend" option and the `includeClasses` checkbox.

### Tests

`neptun.test.ts` against `neptun-orarend.ics`: 144 `ora` + 5 `szunnap`, 10 distinct subjects (`Event-driven Programming` has two groups; `Programming theory` has groups 6 and 1). "Analysis I ( - 1)" on 2026-09-07 runs 10:00–12:00 Budapest. Teachers split on `;`. Room `LD-0-822-01-11`. "Mindenszentek" falls on Budapest date 2026-11-01. A re-import keeps the mapping. Plus `buildCalendar` with the timetable view and `includeClasses`.

## Phase 5: drop the Odyssey copy (Plan 4)

Rewrite every nautical/Odyssey line in the school, notebook and blueprint voice ("engineering notebook at night"): dry, short footnote asides in parentheses, still secondary to the functional copy. Known spots: `app/page.tsx` (`Ithaka…`, `Még üres a fedélzet`), `app/not-found.tsx` (Odüsszeusz), `app/beallitasok/page.tsx` ("A te hajód, a te szabályaid."), `app/radar/page.tsx` (szirének/árboc, "Gyanúsan nyugodt a tenger."), `components/AppShell.tsx` (`Sailboat` logo → a notebook/blueprint icon from lucide, e.g. `NotebookPen` or `PencilRuler`). Grep again for anything else (hajó, tenger, vitorla, kikötő, horgony, fedélzet, sziréna, Ithaka, Odüsszeusz), including in copy you added in Phases 2 to 4.

Update `PRODUCT.md` → Voice ("Wry, warm, notebook-and-blueprint: dry school/engineering asides in parentheses…", with two or three new examples), and any matching line in `DESIGN.md`. Examples of the tone: "(A határidő közelebb van, mint amilyennek a naptárban látszik.)", "(Üres lap. Egyelőre.)". Don't overdo the jokes: one aside per page at most.

## Phase 6: docs

- `CLAUDE.md`: add the new conventions in the existing style: dedup (`lib/ical/dedupe.ts`, computed not stored, stable identities, `ignoredDuplicatePairs`, `ExportOptions.dedupe`), the timetable (`ClassSession`/`TimetableSource`, `lib/ical/neptun.ts`, file import stays in the browser, `?nezet=orarend`, `includeClasses`), the `chg:<token>` due-change record, `npm test` (node:test, `test/alias-loader.mjs`, fixtures in `fixtures/ical`, TZ=UTC).
- `docs/PLAN.md`: move the shipped items to "Done", strike "no automated tests", and note the open follow-ups: Neptun exams into dedup once a `neptun-vizsga.ics` fixture exists, and a Neptun URL feed if Neptun ever offers one.
- `README.md`: the feature list (Órarend import, duplikátumok), `npm test` under Fejlesztés.
