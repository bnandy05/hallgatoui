@AGENTS.md

# Project conventions

Hallgatói réteg: a per-course dashboard that sits on top of university systems (Neptun, Teams, Canvas, Moodle, TMS, Discord…).

- **Language:** all UI text is Hungarian; code, identifiers and comments are English. Routes are Hungarian (`/`, `/targy/[id]`, `/radar`, `/beallitasok`).
- **Local-first:** no backend, no auth. All data lives in the zustand store `lib/store.ts`, persisted to localStorage (`hallgatoireteg-v1`). Types are in `lib/types.ts`. Select slices individually: `useStore((s) => s.courses)`.
- **Hydration:** components that read the store are client components and render a skeleton until `useHydrated()` (`lib/useHydrated.ts`) returns true.
- **Dynamic routes:** `page.tsx` is a thin server component that awaits `params` (typed with `PageProps<"/route/[id]">`) and renders a client component (e.g. `app/targy/[id]/page.tsx` → `components/CourseDetail.tsx`).
- **UI:** Tailwind v4 with the color tokens from `app/globals.css` (`bg-card`, `border-border`, `text-muted`, `bg-accent`, `text-danger`…). Build from `components/ui/*` and use `lucide-react` icons. No component libraries, and no new dependencies without asking.
- **Platforms:** built-in platforms are in `lib/platforms.ts`, and user-defined ones in `customPlatforms`. Always resolve them with `getPlatform(id, customPlatforms)`. Normalise user URLs with `normalizeLinkUrl` (`lib/url.ts`).
- **Deadlines:** urgency, week grouping and the weekly summary are pure functions in `lib/radar.ts` (weeks start on Monday). Reuse them; don't recompute urgency in components. Deadlines with `source: "ical"` can't be edited or deleted, only marked done or critical.
- **iCal:** the only server code is `app/api/ical/route.ts`, a CORS proxy. Every URL, and every redirect hop, must pass `assertPublicUrl` (`lib/ical/ssrf.ts`); never remove that check or switch to `redirect: "follow"`. Parsing (`lib/ical/parse.ts`) and course matching (`lib/ical/match.ts`) are pure functions. Sync goes through `lib/ical/client.ts` → the store's `applyFeedSync`, which upserts by `(feedId, externalUid)` and keeps the user's `done`/`critical`/course choices. Canvas context parsing lives in `lib/ical/canvas.ts`, discovery in `lib/ical/discover.ts` + the store's `applyDiscovery`; matching is longest-keyword-wins.
- **Search & quick-add:** search lives in `lib/search.ts` + `components/CommandPalette.tsx`, the quick-add parser in `lib/quickAdd.ts`; matching is accent-insensitive via `normalizeSearch` (`lib/text.ts`).
- **Dialogs:** `components/ui/Dialog.tsx` mounts its children only while open, so forms inside it initialise from props with `useState(initial…)`.
- **Settings page:** each section is its own component in `components/settings/`, rendered by `app/beallitasok/page.tsx`.
