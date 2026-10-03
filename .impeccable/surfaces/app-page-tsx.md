---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/radar/page.tsx","app/beallitasok/page.tsx","components/week/CourseWeekDetail.tsx"]
---

# Surface brief: the app (all pages)

Scope: `/`, `/radar`, `/targy/[id]`, `/beallitasok`. The former `/uj` parallel routes replaced the old pages and are now the default; the card-grid home, `CourseCard`, `CourseDetail` and `RadarWidget` are gone. Visitor mode: Operate. Same visual world (night blueprint tokens, Fira Code, existing components/ui).

Job: daily triage (what is due, tick it off, open the right platform) and setup (courses, links, feeds, subscription).

## Direction contract

THESIS: Time is the page's spine. Home is this week laid out Monday to Sunday, so urgency reads by position rather than by badge. It refuses the category default: a card grid of courses with a duplicated "upcoming" widget.

OWN-WORLD: Ink-navy graph paper, panel cards, highlighter-yellow accent, chalk-mint secondary, Fira Code, § eyebrows, terminal summary. The red notebook margin line becomes the vertical NOW line on the week board. Course colours appear as dots and spines.

STORY: The student sees this week's load immediately, sees what is overdue to the left of the now-line, ticks things done in place, and launches Canvas/Neptun/Teams from the course table without opening a course.

FIRST VIEWPORT: Compact header row (eyebrow "Heti menetrend", week range, prev/next/today controls, + Határidő, + Tárgy). Under it, a full-width 7-column week board (overdue gutter at the left, the red now-line through today's column). Each day holds compact deadline chips (course dot, title, time). Below: the course launch table (colour, name, code, platform icon buttons, next deadline, open count). On mobile the board becomes a day-by-day list starting at today.

FORM: Week board (Heti menetrend). Radar = the multi-week board with a toolbar of filters. Course page = header, its own week strip, tabs Határidők / Linkek / Tudásbázis. Settings = tabs with hash sync.

MOTION: One authored moment: on first load the lead board's columns are ruled in left to right (clip-path, 45 ms stagger), then the red now-line is drawn down today's column. Week navigation slides the days in from the side moved to, inside a fixed frame. Ticking a deadline draws a strike through its title. Dialogs rise 10 px into place; tab panels settle in. Radar boards keep the scroll reveal and only draw the now-line. Reduced motion: cross-fades and instant strikes, no movement.
