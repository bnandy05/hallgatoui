---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/radar/page.tsx","app/beallitasok/page.tsx","components/week/CourseWeekDetail.tsx"]
---

# Surface brief: the app (all pages)

Scope: `/`, `/radar`, `/targy/[id]`, `/beallitasok`, dialogs and the command palette. Visitor mode: Operate. Redesign: the night-blueprint world is retired.

Job: daily triage (what is due, tick it off, open the right platform) and setup (courses, links, feeds, subscription). Copy: concise, professional Hungarian, no asides.

## Direction contract

THESIS: The app is the faculty corridor notice board, made calm. Time stays the spine (the week board), but every deadline is a paper slip pinned to it, and the pin carries meaning: course colour while open, red for now, removed when done. It refuses both the dark-dashboard-with-neon look it replaces and the generic white SaaS calendar.

OWN-WORLD: Cool grey-blue felt ground (light, flat), white copy-paper sheets and slips with soft paper shadows, coloured copy paper as state washes (canary = today, salmon = overdue, sky = classes), black toner ink for type and primary buttons, one red pushpin colour for now/critical. Archivo grotesk, condensed heavy for headings like a printed notice, normal width for UI, tabular figures. Small radii (cut paper). Pins are round heads in course colours.

STORY: The student opens the app, sees the week pinned up Monday to Sunday with overdue slips on salmon paper at the left and today on a canary sheet under a red pin, reads the single "next" notice, ticks slips off (the pin pops and the slip hangs loose), and launches Canvas/Neptun/Teams from the course list without opening a course.

FIRST VIEWPORT: Slim top bar on felt (wordmark with pin, nav Hét / Határidők / Beállítások, search ⌘K, primary "Új határidő"). Heading row: week range as condensed h1, one summary line, week nav + Órák toggle on the right. A one-line "Következő" notice with a red pin. Full-width 7-day board of pinned slips. Below: the course list on one pinned white sheet.

FORM: Pinned week board + course list (candidate 5 of 7 grounded list: leckekönyv, MÁV menetrend, library due-date slip, risograph HÖK flyer, corridor notice board, highlighter study notes, wall planner). Seed key be9480da. Signature move: pins encode state; the background canvas draws faint drifting ghost slips and pinholes seeded from the user's real open deadlines (course colours), static under reduced motion. Raises: length is time (a thin bar under each open slip shows time left within the week), flat colour only (no gradients, glows, glass), one item owns focus (the Következő notice).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
