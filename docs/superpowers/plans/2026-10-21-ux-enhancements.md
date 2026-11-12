# UX enhancements: confirm dialog, undo, effort, checklist, browser checks

Branch `claude/ux-enhancements` (cut from `claude/legal`). Each phase is implemented by a Sonnet subagent, one after another in the same checkout, because they share the dictionaries, `components/DeadlineItem.tsx`, `lib/types.ts` and the store. The coder runs `npm run lint && npm run build && npm test` itself; nobody commits (the owner commits). Follow `CLAUDE.md` throughout: both dictionaries in step, tokens only, `components/ui/*`, lucide icons, no new dependencies, `prefers-reduced-motion`, demo mode keeps working.

Order: 1 → 2 → 6 → 7 → 3 (the browser pass checks the finished work too).

## Phase 1: pinned confirmation dialog (replaces `confirm()`)

**Goal:** no `window.confirm()` left in the app; destructive or consequential questions are a notice-board `Dialog`.

- New `components/ui/ConfirmDialog.tsx`, built on `Dialog` + `DialogActions`: props `open`, `onClose`, `onConfirm`, `title`, `message?` (ReactNode), `confirmLabel`, `tone?: "danger" | "default"` (danger: red `--danger` confirm button, pin colour `--pin`), `busy?`. Cancel is the default focus on pointer devices so Enter never destroys by accident; Escape cancels.
- A small hook makes the call sites short, e.g. `const { confirm, dialog } = useConfirm()` where `await confirm({ … })` resolves `true|false` and `{dialog}` is rendered once in the component. Any shape is fine as long as it stays React-only and simple.
- Replace every call site: `ResourceList.tsx:72`, `LinkEditor.tsx:92`, `settings/TimetableSourceItem.tsx:34`, `settings/PlatformSettings.tsx:37`, `settings/DigestSettings.tsx:85`, `settings/CalendarSubscriptionSettings.tsx:69,76`, `week/CourseWeekDetail.tsx:185`, `settings/FeedSettings.tsx:114,296`, `settings/DataSettings.tsx:62,81`.
- **Leave `DeadlineItem.tsx:134` (single deadline delete) alone**: phase 2 replaces it with undo.
- Dictionary: the existing `confirm…` strings become the dialog message; add a short title and a confirm-button label per case (e.g. "Tárgy törlése" / "Delete course", "Törlés" / "Delete"; rotate: "Új link" / "New link"). Keep the wording concise, professional Hungarian.
- Remove the "Destructive actions still use the browser's `confirm()`" line from `docs/PLAN.md` → Known limitations.

## Phase 2: undo for ticking off and deleting deadlines

**Goal:** after ticking a deadline done (or undone) or deleting deadlines, a toast offers "Visszavonás" / "Undo" for ~6 s.

- New `components/ui/Toast.tsx`: one toast at a time (a new one replaces the old), a paper slip at the bottom centre, above the mobile tab bar and the demo strip, `role="status"` / `aria-live="polite"`, an action button and a close `IconButton`, auto-dismiss after 6 s, paused while hovered or focused; entrance/exit motion only without `prefers-reduced-motion`. A tiny zustand store (separate from `lib/store.ts`, not persisted, not in `AppData`) or a context provider in `AppShell`; expose `showToast({ message, actionLabel, onAction })`.
- Store: add `restoreDeadlines(items: Deadline[])` to `lib/store.ts`: puts the given deadline objects back (replacing any with the same id, appending missing ones) **and removes their ids from `tombstones`**, so a deletion that already synced is undone everywhere (the restored items get a fresh `updatedAt` from `trackChanges`, which is newer than the tombstone). Check `lib/sync/stamp.ts` / `lib/sync/tombstones.ts` for how tombstones are written, and add a pure test (e.g. in `test/`) if the tombstone logic needs a pure helper.
- Undo = snapshot before the action, restore after: capture the affected deadlines (the target plus its dedupe group followers for `toggleDone`; the deleted ones for delete), run the action, show the toast whose action calls `restoreDeadlines(snapshot)`.
- Wire it where deadlines are ticked (`DeadlineChip`/slip tick, the detail dialog's done action, agenda rows; find every `toggleDone` call in components) and where they are deleted (`DeadlineDetailDialog`: single delete now deletes at once without a confirm and shows the undo toast; the series "Csak ezt" / "Ezt és a későbbieket" choice stays and also gets the undo toast).
- Messages: "Kész: <title>" / "Done: <title>", "Visszaállítva…" not needed; "Határidő törölve" / "Deadline deleted", "<n> határidő törölve" via `t.counts`-style function. Truncate long titles with CSS, not in the string.
- Works in the demo too (it's client-only).

## Phase 6: effort estimate and weekly workload

**Goal:** a deadline can carry an optional time estimate; weeks show the estimated workload.

- `Deadline.estimateMinutes?: number` (positive integer, ≤ 10080). It is a **user field** like `done`/`critical`: allowed on `source: "ical"` deadlines too, and kept by feed syncs (`mergeFeedSync` spreads `...existing`, verify with a test in `test/`). Field-level merge in `lib/sync/merge.ts` handles new keys generically; confirm.
- `lib/server/validate.ts`: if it validates deadline fields, accept/clamp the new one; otherwise nothing.
- Pure helpers in `lib/radar.ts` (React-free): `formatEstimate(minutes, locale)` ("~45 p", "~2 ó", "~1,5 ó"; en "~45 min", "~2 h", "~1.5 h"), and extend `weekSummary` (or add `weekWorkload(deadlines, now)`) with `estimatedMinutes` (open deadlines due this week) and `unestimated` count. Tests for both.
- Form: `DeadlineForm` gets an optional "Becsült idő" / "Estimated time" control: preset chips (30 p, 1 ó, 2 ó, 4 ó, 8 ó) plus a free number of hours; empty = none. For iCal deadlines the detail dialog offers the same control (since the form isn't used for them).
- Display: a small "~2 ó" mark on the slip (`DeadlineChip`) and in the detail dialog; on the home week heading and on Határidők per week strip, "~9 ó becsült munka" / "~9 h estimated work" when any open deadline in that week has an estimate. No red for workload: use the canary paper when the week's estimate exceeds 20 h (constant in `lib/radar.ts`).
- Use `useDedupedDeadlines()` for anything that sums, so duplicates don't double the workload.
- Not in scope: .ics export, digest, quick-add parsing.

## Phase 7: checklist on a deadline

**Goal:** a deadline can have sub-steps that can be ticked off.

- `Deadline.checklist?: { id: string; text: string; done: boolean }[]` (at most 20 items, text ≤ 200 chars, trimmed, empty items dropped). User field, allowed on iCal deadlines, kept by feed syncs (test). The whole array is one field for the merge (latest edit wins); note that in a comment.
- Pure helpers (e.g. `lib/checklist.ts`): `checklistProgress(list) → { done, total }`, `normalizeChecklist(list)` (caps, trims, drops empties). Tests.
- Editing lives in the deadline detail dialog (`DeadlineDetailDialog`), for manual and iCal deadlines: a list of `Checkbox` rows, an "Új lépés" / "Add step" input (Enter adds), delete per row (`IconButton`), inline edit of the text. Changes save immediately through `updateDeadline`. The manual `DeadlineForm` doesn't need it.
- Display: a "2/5" progress mark on the slip (`DeadlineChip`) and in agenda rows when a checklist exists. Ticking every item does **not** complete the deadline.
- Dedupe: a group shows and edits the primary's checklist.
- Not in scope: .ics export, digest, search.

## Phase 3: browser pass

**Goal:** check the finished branch and the items the roadmap lists as never browser-checked; fix small bugs found, report larger ones.

Use the built-in browser preview (`.claude/launch.json`; create a `dev` entry for `npm run dev` on port 3000 if missing) and the demo ("Bemutató indítása"), so no account is needed. Check desktop and mobile width, light and dark, hu and en:
- phase 1: every converted confirm opens the dialog, Cancel/Escape do nothing, confirm acts;
- phase 2: tick → toast → undo restores; delete → undo restores; series delete → undo; toast position on mobile above the tab bar;
- phase 6: estimate on a manual deadline and an iCal one, slip mark, weekly total, canary over 20 h;
- phase 7: add/tick/edit/delete checklist steps, progress on the slip, iCal deadline checklist survives "refresh" where possible in the demo;
- roadmap leftovers: `/targy/[id]` and the timetable UI since the restyle; the deadline form's Egyszer · Több időpont · Ismétlődő tabs; a weekly series crossing 25 Oct 2026 (DST) keeps its wall-clock time; offline/installability only if the service worker registers in dev (else note it as owner to-do on the Vercel preview).

Report what passed, what was fixed, and what's left. Update `docs/PLAN.md` (Done section entry for this branch, Known limitations).
