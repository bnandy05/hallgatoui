---
version: 1
slug: "app-uj-page-tsx"
primary_target: "app/uj/page.tsx"
related_targets: ["app/uj/radar/page.tsx","app/uj/beallitasok/page.tsx"]
---

# Surface brief: /uj (restructured app, all pages)

Scope: parallel routes /uj, /uj/radar, /uj/targy/[id], /uj/beallitasok. The current routes stay untouched. Visitor mode: Operate. Same visual world (night blueprint tokens, Fira Code, existing components/ui).

Job: daily triage (what is due, tick it off, open the right platform) and setup (courses, links, feeds, subscription).

## Direction contract

THESIS: Time is the page's spine. Home is this week laid out Monday to Sunday, so urgency reads by position rather than by badge. It refuses the category default: a card grid of courses with a duplicated "upcoming" widget.

OWN-WORLD: Ink-navy graph paper, panel cards, highlighter-yellow accent, chalk-mint secondary, Fira Code, § eyebrows, terminal summary. The red notebook margin line becomes the vertical NOW line on the week board. Course colours appear as dots and spines.

STORY: The student sees this week's load immediately, sees what is overdue to the left of the now-line, ticks things done in place, and launches Canvas/Neptun/Teams from the course table without opening a course.

FIRST VIEWPORT: Compact header row (eyebrow "Heti menetrend", week range, prev/next/today controls, + Határidő, + Tárgy). Under it, a full-width 7-column week board (overdue gutter at the left, the red now-line through today's column). Each day holds compact deadline chips (course dot, title, time). Below: the course launch table (colour, name, code, platform icon buttons, next deadline, open count). On mobile the board becomes a day-by-day list starting at today.

FORM: Week board (Heti menetrend), position 3 on the ranked list, seed key f8ed939a. Radar = the multi-week board with a toolbar of filters. Course page = header, its own week strip, tabs Határidők / Linkek / Tudásbázis. Settings = tabs with hash sync.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
