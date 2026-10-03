---
name: Hallgatói réteg
description: A per-course dashboard over university systems, drawn as an engineering notebook at night.
colors:
  ink-navy: "#0e1422"
  ink-inset: "#0a0f1a"
  panel-navy: "#141c2e"
  chalk-white: "#d6e2f0"
  paper-white: "#f3efe3"
  muted-chalk: "#a8b8ce"
  muted-dim: "#8496b0"
  blueprint-border: "#42598a"
  blueprint-border-strong: "#5a78ad"
  highlighter-yellow: "#ffc23d"
  highlighter-deep: "#f5a524"
  highlighter-text: "#ffd46b"
  highlighter-soft: "rgba(255, 194, 61, 0.14)"
  highlighter-ink: "#1a1305"
  chalk-mint: "#5ee0b8"
  success-green: "#4fd98a"
  warning-orange: "#ff9a4d"
  danger-red: "#ff5f7a"
  nav-line: "#253250"
  terminal-bar: "#111829"
  close-red: "#c0392b"
  grid-minor: "rgba(120, 160, 220, 0.06)"
  grid-major: "rgba(120, 160, 220, 0.11)"
  margin-line: "rgba(255, 95, 122, 0.16)"
typography:
  display:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "clamp(26px, 4vw, 36px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "clamp(19px, 2.7vw, 26px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  chip:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.375
  label:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.12em"
  meta:
    fontFamily: "Fira Code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  md: "6px"
  base: "8px"
  lg: "10px"
  full: "9999px"
spacing:
  chip-gap: "6px"
  board-cell: "12px"
  page-gutter: "22px"
  card-padding: "22px"
  section-gap: "40px"
  margin-x: "56px"
  margin-x-narrow: "16px"
  container: "1240px"
components:
  button-primary:
    backgroundColor: "{colors.highlighter-yellow}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-sm:
    backgroundColor: "{colors.highlighter-yellow}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
  button-secondary:
    backgroundColor: "{colors.ink-inset}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-ghost:
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.ink-inset}"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.base}"
    padding: "{spacing.card-padding}"
  input:
    backgroundColor: "{colors.ink-inset}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.base}"
    padding: "8px 12px"
  pill:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.muted-chalk}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  pill-active:
    backgroundColor: "{colors.highlighter-soft}"
    textColor: "{colors.highlighter-text}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  tab:
    textColor: "{colors.muted-chalk}"
    typography: "{typography.body}"
    padding: "8px 12px"
  tab-active:
    textColor: "{colors.highlighter-text}"
    typography: "{typography.body}"
    padding: "8px 12px"
  tab-count-active:
    backgroundColor: "{colors.highlighter-yellow}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  week-board:
    backgroundColor: "{colors.panel-navy}"
    rounded: "{rounded.base}"
    padding: "{spacing.board-cell}"
  week-board-today:
    backgroundColor: "{colors.highlighter-soft}"
    textColor: "{colors.highlighter-text}"
  week-board-overdue:
    textColor: "{colors.danger-red}"
  deadline-chip:
    backgroundColor: "{colors.ink-inset}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.chip}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  course-table:
    backgroundColor: "{colors.panel-navy}"
    rounded: "{rounded.base}"
    padding: "14px 16px"
  course-table-header:
    backgroundColor: "{colors.ink-inset}"
    textColor: "{colors.muted-chalk}"
    typography: "{typography.label}"
    padding: "8px 16px"
---

# Design System: Hallgatói réteg

## Overview

**Creative North Star: "The Night Blueprint"**

The app is an engineering notebook open on a desk at night. The page is ink-navy graph paper (24px minor and 120px major lines, fixed to the viewport) with a thin red margin line down the left. Panels sit on it like slightly lighter paper sheets. One highlighter-yellow marks what matters now; chalk-mint is the second pen, used for prompts and secondary marks. Everything is set in one monospace face, Fira Code, so dates, times and counts line up like notebook entries.

Density is that of a working tool rather than a showcase. A surface carries a compact header row, then a board or table that fills the 1240px container, with 11-14px type doing most of the work. Time is the structural spine: the week board lays deadlines out Monday to Sunday, so urgency reads from position (left of the now-line is late) before any colour or badge does.

Motion is short and functional, with one authored moment: on first load the week board's columns are ruled onto the page left to right and the red now-line is drawn down today's column. Everything else is feedback and continuity (a 1-2px hover lift, a slide when the week changes, a strike drawn through a ticked deadline, dialogs rising into place, a 24px rise-in for content on scroll). Under `prefers-reduced-motion` movement goes and meaning stays: cross-fades and instant state changes.

**Key Characteristics:**
- Dark only (`color-scheme: dark`): graph-paper page, lighter panel sheets, darker inset wells.
- One typeface (Fira Code, weights 400-700) for every role; hierarchy from size, weight and colour.
- Highlighter yellow is the single "now / act here" signal; danger red is reserved for late and critical.
- The notebook's red margin line doubles as the "now" line on the week board.
- Course colours are user data and appear only as small dots and spines, never as fills.
- Hairline blueprint borders keep every card and control edge visible.

## Colors

A night-ink palette: navy neutrals in three tonal layers, one warm highlighter accent with a cool chalk-mint partner, and a small set of status colours tuned to stay distinct from the yellow.

### Primary
- **Highlighter Yellow** (`--accent`): primary buttons (as a gradient into Highlighter Deep), focus outlines, active nav and tab underlines, active tab counts. The "act here" colour.
- **Highlighter Deep** (`--accent-deep`): gradient end on primary buttons only.
- **Highlighter Text** (`--accent-text`): yellow for text on dark: links, active nav and tab text, today's day label, chip hover.
- **Highlighter Soft** (`--accent-soft`): translucent wash for active pills, today's board column, text selection, open-count badges.
- **Highlighter Ink** (`--accent-ink`): the only text colour allowed on yellow or danger fills (11.4:1 on yellow).

### Secondary
- **Chalk Mint** (`--accent-2`): terminal prompts (`›`), the end stop of the `.grad` headline gradient, the bottom-left page glow. A secondary pen, never a button fill.

### Tertiary
- **Danger Red** (`--danger`): overdue gutter, critical flame, late times, chip borders on hot deadlines (45%), the now-line (70%), the danger button.
- **Warning Orange** (`--warning`): "soon" urgency and the `módosult` marker. Orange so it never reads as the yellow accent.
- **Success Green** (`--success`): settings "be" status, copy confirmation.

### Neutral
- **Ink Navy** (`--bg`): the page, under the graph-paper grid.
- **Ink Inset** (`--bg2`): inputs, code blocks, terminal bodies, secondary buttons, deadline chips, table header band. Darker than the page: a well, not a raised surface.
- **Panel Navy** (`--panel`): cards, dialogs, the week board, the course table, the sticky header (at 85% with blur).
- **Paper White** (`--heading`): headings and course names.
- **Chalk White** (`--fg`): body text.
- **Muted Chalk** (`--muted`, 8.4:1 on panel): secondary text, inactive tabs and pills, meta lines.
- **Muted Dim** (`--muted-dim`, 5.6:1 on panel): footnotes, past-day labels, empty-state asides. The floor for readable text.
- **Blueprint Border** (`--border`, 2.5:1 on panel) and **Blueprint Border Strong** (`--border-strong`): all edges, and the neutral hover edge.
- **Nav Line**, **Terminal Bar**, **Close Red**: header rule, terminal title bar, close-button hover.
- **Grid Minor / Grid Major / Margin Line**: the graph paper and the notebook margin, drawn in the body background only.

### Named Rules
**The Ink-On-Highlighter Rule.** Text on a yellow or danger fill is always Highlighter Ink, never white.

**The Data-Colour Rule.** Raw hex appears only for user, course and platform data (and inside TraceField). Course colours render as dots (6-10px) and spines; every other colour comes from a token.

**The Two-Reds Rule.** Danger red means late or critical. It is not decoration; the margin line is its only ambient use.

## Typography

**Display Font:** Fira Code (with ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)
**Body Font:** Fira Code (same stack; `--font-sans` and `--font-mono` are identical)

**Character:** A single engineering monospace for everything. Headings get weight and slight negative tracking; data gets tabular figures so times and counts align in columns.

### Hierarchy
- **Display** (700, clamp(26px, 4vw, 36px), 1.12): the page h1 in `SectionHeading`, with a soft dark text-shadow to lift it off the grid. May carry `.grad` (yellow to mint) on the key phrase, e.g. the current week range.
- **Headline** (700, clamp(19px, 2.7vw, 26px), 1.12): section h2s.
- **Title** (700, 16px): dialog titles, empty-state titles; course names in the table at body size, bold, Paper White.
- **Body** (400-500, 14px, 1.6): running text, buttons, tabs, inputs. Intro paragraphs cap at 620px.
- **Chip** (500, 12.5px, snug): deadline titles on the board and pill labels, clamped to two lines.
- **Label** (700, 11-12px, 0.12em, uppercase): column headers of the course table and the `Lejárt` gutter label. Day names on the board are the same weight, lowercase, 0.04em.
- **Meta** (400, 11px, tabular figures): times, dates, counts, course names under chips.

### Named Rules
**The One Face Rule.** Fira Code is the only family. Do not introduce a display or sans face; build hierarchy from size, weight and colour.

**The Tabular Time Rule.** Every time, date and count uses tabular figures.

## Layout

The shell is a sticky 60px header over a centred 1240px container with 22px side gutters (16px on mobile). A fixed `content-scrim` band of page colour sits behind the container so text without a card stays readable over the grid and traces. Main content runs 40px top padding and stacks sections with 32-40px gaps.

The page grid is literal: the body background is 24px/120px graph paper anchored to the viewport origin, and the red margin line sits at `--margin-x` (56px, 16px below 640px).

Responsive behaviour follows two breakpoints. At `lg` (1024px) the week board becomes a 7-column grid (8 with the overdue gutter, which takes 1.05fr), the course table gains its header row and 4-column template, and settings tabs stack vertically in a 13rem sticky rail. Below `lg` the board becomes one row per day (5.5rem label column, then items), hides settled past days so it effectively starts at today, and tabs scroll sideways. Below `sm` (640px) the course table rows stack.

## Motion

Two easings: `--ease-out` for routine state (hover, colour) and `--ease-out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`) for arrivals. Every entrance animates *from* a hidden keyframe with `backwards` fill, so the resting markup is always the visible state. All motion CSS lives in `globals.css`.

- **Board intro (signature):** the lead board (`WeekBoard intro`: home and course page) clips each column in from the top, 0.5s, 45ms stagger via `--i`. Then today's now-line draws downward (`scaleY` from the top, 0.7s, 0.45s delay). Boards without `intro` (radar) only draw the now-line.
- **Week change:** `data-board-motion="next|prev"`; the columns re-key on the week and slide 28px in from the side moved to, with a 2px blur clearing, 0.32s. The board frame does not move.
- **Done strike:** `.strike[data-done]` sweeps a 1px currentColor line across the title (background-size, 0.32s), across wrapped lines in reading order. Replaces `line-through`.
- **Dialog:** `dialog.sheet[open]` rises 10px from 98.5% scale, 0.28s; backdrop fades 0.24s. Closing is instant (children unmount on close).
- **Tab panel:** `.panel-in` settles 4px, 0.22s, each time a panel is shown.
- **Reduced motion:** board columns and panels cross-fade, dialogs fade, the strike and now-line appear without drawing.

## Elevation & Depth

Depth is mostly tonal: page (Ink Navy), raised sheet (Panel Navy), sunken well (Ink Inset), each edged by a visible blueprint border. Shadows are few and purposeful: a yellow glow that answers hover on primary buttons, and soft dark drop shadows for elements that float over content (terminal, sticky toolbar). Translucent panels with a 10px backdrop blur are used for anything sticky.

### Shadow Vocabulary
- **Accent glow** (`--glow-accent`): primary button hover.
- **Primary resting** (`inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 10px rgba(255,194,61,0.18)`): primary button at rest, a lit top edge.
- **Inset highlight** (`inset 0 1px 0 rgba(255,255,255,0.04)`): secondary button top edge.
- **Terminal float** (`0 24px 60px rgba(0,0,0,0.4)`): the Terminal panel.
- **Sticky float** (`0 12px 32px rgba(0,0,0,0.35)`): the sticky radar filter toolbar.

### Named Rules
**The Tonal-First Rule.** Separate surfaces by panel/inset tone and border first; reach for a shadow only for hover feedback or for something that floats.

## Shapes

Gently rounded rectangles throughout: 8px (`--radius`) for cards, boards, tables, inputs, dialogs; 10px (`--radius-lg`) for buttons and code blocks; 6px for small in-panel parts (deadline chips, launch icons, icon buttons); full pills for filter pills, badges and counts. Course colours are circles. Every container has a 1px border; dashed borders mean "add something here" (empty states, add-link buttons, the closed terminal). The terminal carries a 2px yellow left spine.

## Components

### Buttons
Lit, tactile keys with a 1px lift on hover.
- **Shape:** gently rounded (10px).
- **Primary:** yellow-to-deep-yellow 135deg gradient, Highlighter Text border, semibold Highlighter Ink text, 8px 16px (sm: 6px 10px), 14px. Hover brightens 7% and adds the accent glow.
- **Secondary:** Ink Inset fill, blueprint border, Chalk White text; border turns yellow on hover.
- **Ghost:** transparent, Ink Inset on hover.
- **Danger:** Danger Red fill, Highlighter Ink text, red focus outline.
- **Focus / Disabled:** global 2px yellow outline at 2px offset; disabled at 50% opacity with no pointer events.
- **Icon-only:** secondary sm with 8px horizontal padding (week navigation).

### Chips (Pills)
- **Style:** full-radius, 12.5px, 4px 12px. Inactive: Panel Navy, blueprint border, Muted Chalk. Active: Highlighter Soft wash, yellow border, Highlighter Text.
- **State:** clickable pills are toggle buttons with `aria-pressed`; hover strengthens the border. Course filter pills lead with the course dot.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Panel Navy.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px blueprint border; interactive cards lift 2px and take a yellow border on hover.
- **Internal Padding:** 22px.

### Inputs / Fields
- **Style:** Ink Inset well, 1px blueprint border, 8px radius, 8px 12px, 14px; placeholders in Muted Dim.
- **Focus:** border and 2px outline turn yellow; hover strengthens the border.
- **Checkboxes:** native, tinted with `accent-color: var(--accent)`.

### Navigation
- **Header:** sticky, Panel Navy at 85% with 10px blur, Nav Line bottom rule, 60px tall. Wordmark at 17px bold with a yellow lucide icon.
- **Links:** 14px medium, Muted Chalk; active is Highlighter Text with a 2px yellow underline (`aria-current="page"`). On mobile, labels collapse to 20px icons.

### Tabs
An ARIA tablist with roving focus (Arrow keys, Home, End), paired panels via `TabPanel` (only the active panel mounts its children).
- **Horizontal:** a row over a 1px bottom border; each tab is 14px medium, 8px 12px, with a 2px bottom bar that turns yellow and Highlighter Text when selected; inactive tabs are Muted Chalk. Overflow scrolls sideways without a scrollbar.
- **Vertical (from `lg`):** a stacked rail with 6px-radius items; the active item takes a Highlighter Soft wash, inactive items an inset hover.
- **Counts:** a full-radius 11px tabular badge after the label; yellow fill with Highlighter Ink when active, Ink Inset with Muted Chalk otherwise.
- **Hash sync (settings):** the active tab lives in the URL hash, written with `history.replaceState` (no scroll jump, no history entry per click) and read through `useSyncExternalStore`; old anchors map to their tab via an alias table, and unknown hashes fall back to the first tab.

### Week Board (signature)
The home and course pages' spine: one Panel Navy card, Monday to Sunday.
- **Columns:** seven equal day columns at `lg` (200px min height, 120px when dense), separated by 60%-opacity borders. Past days sit on a 40% inset tint; settled past days are hidden on narrow screens.
- **Now-line:** today's column carries a 2px vertical line in Danger Red at 70% down its left edge, the notebook margin line brought into the board, over a 40% Highlighter Soft wash. Its day label turns Highlighter Text and reads `ma · most HH:mm`; the section has `aria-current="date"`.
- **Overdue gutter:** on the current week, every overdue item collects in a `Lejárt` column left of Monday on a 6% danger wash, with an uppercase danger label and count. Late reads by position.
- **Day header:** lowercase day name (12px bold) over a tabular date (11px Muted Dim).

### Deadline Chip
- **Style:** Ink Inset, 6px radius, 6px 8px, 70% border; hot (overdue or critical) chips take a 45% danger border that goes solid on hover.
- **Content:** a native checkbox (tick done in place), a 12.5px title button that opens the full deadline in a dialog, then an 11px meta line (time in tabular figures, red when hot; flame icon when critical; `módosult` in orange), then the course dot and name.
- **Done:** title goes Muted Chalk with a line-through.

### Course Launch Table (signature)
- **Style:** one Panel Navy card; a Ink Inset (60%) header band with uppercase 11px labels at `lg`; rows divided by 60% borders, 14px 16px padding.
- **Row:** course dot (10px) and bold Paper White name linking to the course; code and semester in 12px Muted Chalk; up to seven platform launch icons (open in a new tab, 1px lift and a ring on hover), a `+N` overflow link and a dashed add/edit-links button; the next deadline with urgency-coloured relative time; an open-count badge (Highlighter Soft when non-zero) and an edit icon button.

### Terminal and Code Block
- **Terminal:** Ink Inset body, 2px yellow left spine, Terminal Bar title strip, 13.5px text at 1.7, mint `›` prompts, optional blinking cursor (static under reduced motion). Closes to a dashed `[ terminál megnyitása ]` button.
- **Code Block:** Ink Inset, 10px radius, yellow `$ ` prompt, copy button that confirms in Success Green.

### Dialog
Native `<dialog>`, Panel Navy, 8px radius, blueprint border, 32rem (lg: 42rem) max width, 60% black backdrop with blur; header row with a bottom border and a 16px bold title. Children mount only while open.

## Do's and Don'ts

### Do:
- **Do** use the tokens through their Tailwind names (`bg-card`, `bg-inset`, `border-border`, `text-muted`, `text-accent-text`, `text-accent-ink`) and the `components/ui` primitives.
- **Do** put text on yellow or danger fills in Highlighter Ink.
- **Do** let position carry urgency on time-based surfaces: overdue left of the now-line, today washed in Highlighter Soft.
- **Do** show course identity as a small colour dot next to the course name.
- **Do** use tabular figures for every time, date and count.
- **Do** keep every edge visible with the 1px blueprint border; strengthen it (`--border-strong`) or turn it yellow on hover.
- **Do** honour `prefers-reduced-motion`: no lifts, slides, reveals, line draws, smooth scroll or cursor blink; keep opacity and colour changes that carry state.
- **Do** use lucide-react icons for every icon.

### Don't:
- **Don't** put white text on accent fills.
- **Don't** use raw hex outside user, course and platform data (and TraceField).
- **Don't** use course colours as card or row fills; they stay dots and spines.
- **Don't** add a second typeface.
- **Don't** use danger red for anything other than late, critical or destructive.
- **Don't** recompute urgency in a component; the board's colours follow `urgencyOf` from `lib/radar.ts`.
