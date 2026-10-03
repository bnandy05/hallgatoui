# iCal fixtures

Real calendar exports used to build and test parsing, course matching, dedup and the Neptun import (see `docs/PLAN.md`).

## Naming

`canvas.ics`, `moodle.ics`, `neptun-orarend.ics`, `neptun-vizsga.ics`. If there are several, add a suffix: `canvas-2.ics`.

## Before committing: scrub personal data

This repo may be public. Open each file in a text editor and:

- **Never** commit a feed URL. Canvas and Moodle feed links contain a private token, and the file itself sometimes repeats it (`X-WR-CALNAME` / `URL:` lines). Delete those lines.
- Replace your name, Neptun code and email if they appear (`ATTENDEE`, `ORGANIZER`, `DESCRIPTION`).
- Keep everything else as-is: `UID`, `DTSTART` / `DTEND` / `DUE`, `RRULE`, `SUMMARY` (course codes and titles), `CATEGORIES` and `LOCATION`. The odd formatting is exactly what the parser needs to see.
- Trimming is fine: one semester's worth of events is plenty.

## Notes about the source

If a system has no iCal export, write here what it does offer (for example "Neptun: only an Excel timetable export under Órarend → Exportálás").
- **Neptun (ELTE):** Naptár → export gives a static `.ics` download (`NeptunCalendarExport.ics`), not a subscribable URL. One VEVENT per class meeting (no `RRULE`), times in UTC (`Z`), a blank line after each `UID`. `SUMMARY` is `<subject> ( - <group>) - <teachers ;-separated> - <type>`, with the type `Lesson` for classes and `Other event` for holidays (`Szünnap/szünet ( - <name>) - Other event`, a zero-length event at Budapest midnight). With an English Neptun UI the subject names are English and there are no subject codes, so they can't be matched to the Hungarian Canvas course names automatically. `neptun-orarend.ics` is such an export (teacher names are public faculty listings).
- **Canvas (ELTE):** all-day assignments come as `DTSTART;VALUE=DATE:20260911T000000` (a DATE value carrying a time). Group-specific due dates use `event-assignment-override-<id>` UIDs and a `(… <semester> <code> - <name>)` part before the `[context]`. The calendar name and description (student name, Neptun code) are scrubbed in `canvas.ics`.
