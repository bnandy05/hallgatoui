---
name: Hallgatói réteg
description: A per-course dashboard over university systems, drawn as the faculty corridor notice board, made calm.
colors:
  felt: "#dde2e4"
  felt-dark: "#c9cfd2"
  day-strip: "#e9ecee"
  day-strip-past: "#d6dbde"
  copy-paper: "#fdfdfa"
  paper-inset: "#f1f2ee"
  toner-ink: "#1b1c1e"
  heading-ink: "#111214"
  muted-ink: "#45484c"
  muted-dim: "#585c61"
  paper-edge: "#c2c8cb"
  paper-edge-strong: "#9aa2a7"
  ballpoint-blue: "#2b5b84"
  pin-red: "#d8352a"
  danger-red: "#b3261e"
  canary: "#f7e27e"
  canary-soft: "#f1e6ab"
  salmon: "#f8cfc2"
  sky: "#d4e6f3"
  success-green: "#1a6b3c"
  warning-amber: "#94470a"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(34px, 5.2vw, 52px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.005em"
    fontVariation: "\"wdth\" 72"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(24px, 3vw, 30px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.005em"
    fontVariation: "\"wdth\" 72"
  subhead:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.02
    fontVariation: "\"wdth\" 72"
  card-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.375
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.02
    fontVariation: "\"wdth\" 72"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  slip-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.375
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
rounded:
  slip: "2px"
  badge: "3px"
  control: "4px"
  lg: "6px"
  pill: "9999px"
spacing:
  slip-gap: "12px"
  card-sm: "20px"
  card-lg: "24px"
  page-x: "24px"
  container: "1240px"
components:
  button-primary:
    backgroundColor: "{colors.toner-ink}"
    textColor: "{colors.copy-paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.copy-paper}"
    textColor: "{colors.toner-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.copy-paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-sm:
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  pill:
    backgroundColor: "{colors.copy-paper}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  pill-active:
    backgroundColor: "{colors.toner-ink}"
    textColor: "{colors.copy-paper}"
  card:
    backgroundColor: "{colors.copy-paper}"
    rounded: "{rounded.slip}"
    padding: "{spacing.card-lg}"
  input:
    backgroundColor: "{colors.copy-paper}"
    textColor: "{colors.toner-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  deadline-slip:
    backgroundColor: "{colors.copy-paper}"
    textColor: "{colors.heading-ink}"
    typography: "{typography.slip-title}"
    rounded: "{rounded.slip}"
    padding: "12px 10px 10px"
  deadline-slip-overdue:
    backgroundColor: "{colors.salmon}"
  class-chip:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.slip}"
    padding: "6px 8px"
  day-strip-today:
    backgroundColor: "{colors.canary-soft}"
    rounded: "{rounded.slip}"
  copy-field:
    backgroundColor: "{colors.paper-inset}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  switch-on:
    backgroundColor: "{colors.toner-ink}"
    rounded: "{rounded.pill}"
    height: "24px"
    width: "40px"
---

# Design System: Hallgatói réteg

## Overview

**Creative North Star: "The Corridor Notice Board, Made Calm"**

The app is the faculty corridor notice board with the noise taken out. A cool grey-blue felt ground carries white copy-paper sheets and slips; every deadline is a slip hung from a round pushpin, and the pin is the state. Coloured copy paper does the rest of the signalling: canary for today, salmon for overdue, sky for classes. Type is black toner. Headings are set like a printed notice, in heavy condensed Archivo; everything else is normal-width Archivo at working size.

Time is the spine. The week board runs Monday to Sunday as seven lighter felt strips, with an overdue gutter on salmon paper at the left when something is late. Density is moderate: one board, one "Következő" notice that owns focus, one sheet for the course list. Behind every page a canvas draws faint ghost slips in the colours of the student's real open deadlines, swaying in a corridor draught; one falls off every few seconds and another is pinned up elsewhere.

The world is light only and flat in colour. It rejects the dark dashboard with neon accents it replaced, and the generic white SaaS calendar. Depth comes from paper physically sitting on felt (soft, short, cool-tinted shadows), never from gradients, glows or glass.

**Key Characteristics:**
- Felt ground, copy-paper surfaces, toner ink, one red pushpin colour.
- Pins encode state; done slips unpin and hang loose.
- Coloured copy paper as a state wash, not as decoration.
- Condensed heavy Archivo for headings, normal-width Archivo for UI, tabular figures for times and counts.
- Cut-paper corners (2 to 4px), soft paper shadows, flat colour.
- Motion is physical and short: pinning, unpinning, dropping into place.

## Colors

A cool felt-and-paper neutral base with black toner as the primary, a red pushpin for urgency, and three copy-paper washes for state.

### Primary
- **Toner Ink** (toner-ink): primary buttons, active pills, active tab underline, checkbox accent, the focus ring, and body text. Hover lifts it to a slightly lighter toner grey. Text on toner is always Copy Paper.

### Secondary
- **Ballpoint Blue** (ballpoint-blue): classes and holidays only. The class dot when a session is unmapped, the class/holiday line in a day strip.

### Tertiary
- **Pushpin Red** (pin-red): the head of the pin when a deadline is overdue or critical, today's strip pin, the wordmark pin, and the text caret.
- **Danger Red** (danger-red): the ink of the same red, for text and fills: late times, the "Lejárt" gutter heading, the critical flame, destructive buttons, the time-left bar on hot slips.

### Neutral
- **Felt** (felt): the page ground and the browser theme colour.
- **Felt Dark** (felt-dark): the header and footer rules and the tab baseline, drawn on felt.
- **Day Strip** / **Past Day Strip** (day-strip, day-strip-past): a day column on the board, a lighter band of felt; past days sit a step darker.
- **Copy Paper** (copy-paper): sheets, slips, dialogs, inputs, secondary buttons.
- **Paper Inset** (paper-inset): wells on paper: code blocks, disabled fields, table headers.
- **Heading Ink** / **Muted Ink** / **Muted Dim**: heading text; secondary text (9:1 on paper); the readable floor on felt (5.2:1), used for placeholders and quiet metadata.
- **Paper Edge** / **Paper Edge Strong**: hairline borders on paper; the hover border and the neutral pin for slips without a course.

### State washes
- **Canary** (canary): attention on paper: setup banners, the active command-palette row, the course list's open-count badge, text selection.
- **Canary Soft** (canary-soft): today's day strip (canary laid over felt, opaque).
- **Salmon** (salmon): overdue: the overdue gutter and an open overdue slip.
- **Sky** (sky): classes and holidays: class chips, a holiday's day strip.
- **Success Green** / **Warning Amber**: confirmations ("Másolva") and the "módosult" / "vizsga" marks.

### Named Rules
**The Copy-Paper Code Rule.** Canary means today (and attention), salmon means overdue, sky means classes. Never use a wash for decoration or swap their meanings.

**The One Red Pin Rule.** Red is reserved for now, late, critical and destructive. A slip that is merely open carries its course colour, not red.

**The Data-Only Hex Rule.** Raw hex appears only for user, course and platform data and inside the `PinboardField` canvas. Everything else uses the tokens in `app/tokens.css` through the Tailwind colours in `globals.css`.

## Typography

**Display Font:** Archivo, condensed via the `wdth` axis (72%), weight 800 (with ui-sans-serif, system-ui)
**Body Font:** Archivo at normal width (with ui-sans-serif, system-ui)
**Label/Mono Font:** system monospace, only inside code blocks

**Character:** one grotesk family doing two jobs: a printed-notice voice when condensed and heavy, a plain working voice at normal width. Times and counts use tabular figures.

### Hierarchy
- **Display** (800, clamp(34px, 5.2vw, 52px), 1.02): the page h1, such as the week range.
- **Headline** (800, clamp(24px, 3vw, 30px), 1.02): section h2s ("Tárgyak"), dialog titles and empty-state titles at 24px.
- **Subhead** (800 condensed, 22px): headings inside a page section ("Mi kerüljön bele", "Lejárt" on the course page, week names in agendas) and notice titles on sheets.
- **Card title** (700, 16px): the name on a course card, feed card or deadline-sheet field; 16px is also every text field on touch screens.
- **Title** (800 condensed, 19px): day-strip headings and the "Lejárt" gutter heading; the "Következő" relative time at 22px.
- **Body** (400, 14.5px, 1.55): UI text, fields, buttons; subtitles under headings at 15px, capped at 62ch.
- **Slip title** (600, 13.5px, snug): a deadline's title on its slip; metadata under it at 12px.
- **Label** (600, 13px): form labels and the inline "Következő" label.

### Named Rules
**The Printed Notice Rule.** Condensed heavy Archivo (the display class) is for headings only. Body, controls and slips stay at normal width.

**The No Kicker Rule.** A heading is a title and at most one line of subtext under it (`SectionHeading`). No eyebrows, kickers or uppercase tracked labels above headings.

## Layout

A single centred column, max 1240px, 16px side padding (24px from sm), 32px top padding (40px from sm). The top bar is sticky on felt with a felt-dark rule, 64px tall from md (56px below): wordmark with pin, nav (Hét / Határidők / Beállítások, from md only), search, and the primary "Új határidő". Below md the nav moves to a fixed bottom tab bar (64px, icon over a 12px label, the active tab a Copy Paper tab with the paper shadow), and the footer pads itself clear of it.

**Hét (home):** the heading row pairs the condensed week range (with its one summary line) and the "Következő" notice, a 24rem pinned slip on the right from lg, stacked under the heading on narrow screens. Setup banners follow, then the week controls (‹ Ez a hét ›, Órák toggle) directly above the board they drive. Below the board, "Tárgyak" is a grid of pinned index cards (auto-fill, min 16.5rem): course pin, name and code, open-count badge and edit; the next deadline and class under a hairline; platform launchers along the bottom.

**Határidők:** from lg a 15rem filter sheet sticks on the left (toggles, platform select, the course filter as a vertical list, result count); below lg it sits on top, with the courses as a sideways-scrolling row of pills. The list is an agenda, not a board: an overdue block on Salmon, then each week as a heading over day strips that only exist for days with slips (day name and date in an 8rem column, 5.5rem below sm, slips in an auto-fill grid).

**Tárgy page:** from lg a 19rem course index card sticks on the left (pin in the course colour, condensed name, open count, next deadline and class, launch tiles with the link's host, "Linkek szerkesztése", edit and delete); stacked on top below lg. The main column has sections, not tabs: Határidők (overdue block, then the day-strip agenda per week, a "Kész" drawer), Órák (the coming seven days, when the course has classes) and Anyagok (pinned notes in an auto-fill grid with a dashed add slot; type filters only for types in use).

**Beállítások:** below lg the page is an index of sections with their status ("2 forrás", "Bekapcsolva"); a section opens with a "← Beállítások" back link (a history entry, so Back works). From lg, vertical tabs as before. Calendar feeds are pinned cards (pin red when the last sync failed) with a sync status line and labelled Frissítés / Szerkesztés / Törlés; Neptun timetables are cards on Sky paper, taped flat. Adding and editing a feed happen in sheets. The subscription leads with the link (copy field, view, Apple / Google buttons), then "Mi kerüljön bele" and "Extrák" as switch groups.

**Határidők filters below lg:** one sideways-scrolling row: a "Szűrők" pill (toner when any non-course filter is on) that opens a sheet with the toggles, then the course pills.

The week board is a stack of day strips on narrow screens (each strip a two-column grid: a 5.5rem day header beside its slips) and a 7-column grid from lg, with an optional wider overdue gutter in front. Strips have 12px internal gaps between slips; empty days are hidden on narrow screens. Settings use tabs that scroll sideways on narrow screens and stack vertically from lg. Cards pad 20px, 24px from sm.

## Elevation & Depth

Depth is paper on felt: every surface is flat in colour and lifted only by a soft, cool-tinted cast shadow. Shadows describe material, not importance; hovering a slip lifts it a little further.

### Shadow Vocabulary
- **Paper** (`0 1px 1px rgba(30,40,48,0.08), 0 3px 8px -3px rgba(30,40,48,0.22)`): slips, the active nav item and active vertical tab.
- **Sheet** (`0 1px 2px rgba(30,40,48,0.08), 0 10px 24px -12px rgba(30,40,48,0.3)`): sheets pinned to the felt: cards, the course list, settings panels.
- **Lift** (`0 2px 3px rgba(30,40,48,0.1), 0 12px 22px -10px rgba(30,40,48,0.35)`): hover on slips and interactive cards.
- **Dialog** (`0 24px 60px -20px rgba(20,28,34,0.5)`): dialogs, over a rgba(40,48,54,0.45) backdrop.
- **Pin cast** (`1px 2px 2px rgba(20,24,28,0.35)`): the pin head's shadow on paper.

### Named Rules
**The Flat Pin Rule.** A pin is one flat colour with a small cast shadow. No gradients, glows, highlights or glass on pins or anywhere else.

**The Taped Class Rule.** Classes are not deadlines: class chips are taped flat, with no pin, no checkbox and no shadow.

## Shapes

Cut-paper corners. Slips, sheets, day strips and dialogs use 2px; controls, inputs and code blocks 4px; badges 3px. Pills and the pin head are fully round. The 11px pin sits half off the slip's top edge, near its top-left corner; today's strip carries a pin at its top centre. Borders are 1px hairlines in Paper Edge; empty states are a 2px dashed outline where a sheet would go.

## Components

### Buttons
Toner-black, firm, small-radius.
- **Shape:** gently cut corners (4px), 40px tall (32px small), 16px / 12px horizontal padding, 14.5px / 13.5px text.
- **Primary:** Toner Ink fill and border, Copy Paper text, semibold, a 1px toner shadow. Hover a slightly lighter toner grey; active presses down 1px.
- **Secondary:** Copy Paper with a Paper Edge border; hover strengthens the border and adds the paper shadow.
- **Ghost:** transparent; hover a 5% black wash.
- **Danger:** Danger Red fill, Copy Paper text, hover darker red, red focus outline.
- **Disabled:** Paper Inset fill, Muted Dim text, no shadow.

### Chips
- **Pill:** round, 32px tall, Copy Paper with a Paper Edge border and Muted Ink text; active is Toner Ink with Copy Paper text. Toggle pills expose aria-pressed.
- **Badge:** a small rubber stamp, 3px corners, 11.5px semibold: a 1px outline in the colour at 55% and text mixed 80% towards black, no fill. No pastel tag fills anywhere.
- **Class chip:** Sky at 80%, 2px corners, 12px text, a course-colour dot (Ballpoint Blue when unmapped), the time range in tabular semibold.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** Copy Paper on felt.
- **Shadow Strategy:** the Sheet shadow; interactive cards take the Lift shadow on hover.
- **Border:** none; the shadow is the edge.
- **Internal Padding:** 20px, 24px from sm.

### Inputs / Fields
- **Style:** Copy Paper, 1px Paper Edge border, 4px corners, 8px 12px padding, 14.5px text, a faint inset shadow; Muted Dim placeholders; the caret is Pushpin Red.
- **Touch:** on coarse pointers every text field, select and textarea is 16px (iOS zooms into anything smaller and stays zoomed), and checkboxes are 18px.
- **Focus:** border and a 2px outline in Toner Ink.
- **Disabled:** Paper Inset fill, Muted Ink text.

### Navigation
Top-bar links are 36px tall, 14.5px semibold, Muted Ink; hover a 60% paper wash; the active route becomes a Copy Paper tab with the paper shadow. Tabs underline the active item with a 2px Toner Ink border; counts sit in a round chip (Toner Ink when active). Focus everywhere is a 2px Toner Ink outline offset by 2px.

### Deadline Slip (signature)
A Copy Paper slip with 2px corners and the paper shadow, hung from a pin near its top-left. The pin carries state: the course colour while open, Pushpin Red when overdue or critical, removed when done. An open overdue slip is printed on Salmon. A 2px bar along the bottom edge is as long as the time left within the coming week (red-tinted when hot). Ticking it off draws a strike through the title, pops the pin up and away, and lets the slip hang loose: tilted -2.2deg, 2px lower, at 72% opacity.

### Week Board (signature)
Day strips of lighter felt; today is Canary Soft with a red pin at the top, holidays are Sky, past days are a step darker. On first load the slips are pinned up column by column, left to right (55ms stagger per column, pins pressing in after their slip); changing week slides the days in 24px from the side you moved to.

### Switches, copy fields, ruled lists
- **Switch** (`components/ui/Switch.tsx`): settings toggles are a label with a one-line description and a 40x24 switch, Toner Ink track when on, Paper Inset with a Paper Edge Strong outline when off. Groups of switches sit on one sheet, ruled by hairlines.
- **Copy field** (`components/ui/CopyField.tsx`): a read-only link in a Paper Inset field (selects all on focus) beside one primary "Link másolása" button that confirms with "Másolva" in Success Green. No monospace, no prompt glyphs.
- **Lists inside a sheet** (link editor, discovery, timetable mapping, settings rows) are ruled with hairlines, never cards on paper. Adding is a dashed slot ("+ Új link", "+ Anyag hozzáadása", "+ Új naptár") that opens the form.

### Dialogs
Copy Paper sheets with 2px corners and the Dialog shadow; a condensed 24px title over a hairline rule, sticky at the top while the sheet scrolls, with a 40px close button. Form dialogs end in `DialogActions`, a Cancel / Save row stuck to the bottom edge. From sm the sheet is centred (max 32rem or 42rem, 3rem clear of the viewport); below sm it is a bottom sheet the full width of the screen, at most 100dvh minus 2.5rem, with equal-width actions. The page behind does not scroll. With a mouse the first text field takes focus on open; on touch the close button does (search opts back in), so the keyboard never covers the sheet unasked. A deadline's detail is the slip itself: the dialog takes a `pinColor` (the slip's state) beside a title set in the display face, and `tone="salmon"` when it is overdue; the due date leads, then ruled Tárgy / Platform / Források / Megjegyzés rows, and the actions are spelled out (Kész, Kritikus, Szerkesztés, Törlés). Opening drops the sheet 10px into place with a slight rotation (below sm it rises 48px from the bottom) while the backdrop fades.

### Pinboard Field (signature)
A fixed full-viewport canvas behind every page: pinholes and faint ghost slips seeded from the user's open deadlines, pins in their course colours. Ghosts sway; roughly every 5.2s one falls off and another is pinned up elsewhere. Behind the 1240px content column the ghosts are drawn at 30% and without pins, so nothing competes with text. Under reduced motion it renders one static frame.

## Do's and Don'ts

### Do:
- **Do** let the pin carry state: course colour while open, Pushpin Red when overdue or critical, gone when done.
- **Do** use the copy-paper code: Canary Soft for today, Salmon for overdue, Sky for classes and holidays.
- **Do** make Toner Ink the primary button and active-control colour, with Copy Paper text on it.
- **Do** head pages and sections with `SectionHeading`: a condensed heavy title and at most one line of subtext.
- **Do** use tabular figures for times, dates and counts.
- **Do** keep motion physical and short (0.24 to 0.55s, ease-out-expo) and give every animation a cross-fade under `prefers-reduced-motion`.
- **Do** write concise, professional Hungarian UI copy.

### Don't:
- **Don't** use gradients, glows or glass, on pins or anywhere else.
- **Don't** put eyebrows, kickers or uppercase tracked labels above headings.
- **Don't** use raw hex outside user, course and platform data and `PinboardField`.
- **Don't** pin a class chip or give it a shadow; classes are taped flat.
- **Don't** use red for anything that is not now, late, critical or destructive.
- **Don't** introduce a dark theme; the world is light only.
