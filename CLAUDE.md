@AGENTS.md

# Project conventions

Hallgatói réteg: a per-course dashboard that sits on top of university systems (Neptun, Teams, Canvas, Moodle, TMS, Discord…).

- **Language:** all UI text is Hungarian; code, identifiers and comments are English. Routes are Hungarian (`/`, `/targy/[id]`, `/beallitasok`).
- **Local-first:** no backend, no auth. All data lives in the zustand store `lib/store.ts`, persisted to localStorage (`hallgatoireteg-v1`). Types are in `lib/types.ts`. Select slices individually: `useStore((s) => s.courses)`.
- **Hydration:** components that read the store are client components and render a skeleton until `useHydrated()` (`lib/useHydrated.ts`) returns true.
- **Dynamic routes:** `page.tsx` is a thin server component that awaits `params` (typed with `PageProps<"/route/[id]">`) and renders a client component (e.g. `app/targy/[id]/page.tsx` → `components/CourseDetail.tsx`).
- **UI:** Tailwind v4 with the color tokens from `app/globals.css` (`bg-card`, `border-border`, `text-muted`, `bg-accent`, `text-danger`…). Build from `components/ui/*` and use `lucide-react` icons. No component libraries, and no new dependencies without asking.
- **Platforms:** built-in platforms are in `lib/platforms.ts`, and user-defined ones in `customPlatforms`. Always resolve them with `getPlatform(id, customPlatforms)`. Normalise user URLs with `normalizeLinkUrl` (`lib/url.ts`).
- **Settings page:** each section is its own component in `components/settings/`, rendered by `app/beallitasok/page.tsx`.
