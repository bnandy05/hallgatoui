"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { DEMO_TOUR_KEY, registerFromDemo } from "@/lib/demoMode";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { NeedsAccountStamp } from "@/components/demo/NeedsAccount";

type StepKey = keyof ReturnType<typeof useT>["demo"]["steps"];

interface Step {
  key: StepKey;
  /** Where the step is shown; null stays on the current page. A function gets the first course id. */
  path: string | null | ((courseId: string | undefined) => string);
  /** `data-tour` value of the element to highlight. */
  target?: string;
  locked?: boolean;
}

const STEPS: Step[] = [
  { key: "welcome", path: "/" },
  { key: "board", path: "/", target: "week-board" },
  { key: "courses", path: "/", target: "courses" },
  { key: "course", path: (id) => (id ? `/targy/${id}` : "/"), target: "course-card" },
  { key: "newDeadline", path: null, target: "new-deadline" },
  { key: "search", path: null, target: "search" },
  { key: "radar", path: "/radar", target: "deadline-list" },
  { key: "reminders", path: null, target: "reminders" },
  { key: "feeds", path: "/beallitasok#naptarak", target: "feeds" },
  { key: "subscription", path: "/beallitasok#exportalas", target: "subscription", locked: true },
  { key: "digest", path: "/beallitasok#ertesitesek", target: "digest", locked: true },
  { key: "finish", path: null },
];

// The position lives in sessionStorage (it survives reloads within the tab); null = closed.
const TOUR_EVENT = "demo-tour";

function readStep(): number | null {
  try {
    const raw = sessionStorage.getItem(DEMO_TOUR_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
  } catch {
    return null;
  }
}

function writeStep(step: number | null) {
  try {
    if (step === null) sessionStorage.removeItem(DEMO_TOUR_KEY);
    else sessionStorage.setItem(DEMO_TOUR_KEY, String(step));
  } catch {
    // Blocked storage: the tour simply can't be reopened after a reload.
  }
  window.dispatchEvent(new Event(TOUR_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(TOUR_EVENT, callback);
  return () => window.removeEventListener(TOUR_EVENT, callback);
}

/** Opens the guide from its first step. */
export function openDemoTour() {
  writeStep(0);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Highlights the step's element once it is on the page (it may render after navigation). */
function useHighlight(target: string | undefined, pathname: string) {
  useEffect(() => {
    if (!target) return;
    let marked: Element | null = null;
    let tries = 0;
    const timer = setInterval(() => {
      const el = Array.from(document.querySelectorAll(`[data-tour="${target}"]`)).find(
        (node) => node.getClientRects().length > 0
      );
      if (el) {
        clearInterval(timer);
        marked = el;
        el.setAttribute("data-tour-active", "");
        // Only scrolled to when its top is off screen (or under the guide card); tall elements (the
        // board, the course list) start under the header instead of being centred.
        const rect = el.getBoundingClientRect();
        const onScreen = rect.top >= 64 && rect.top < window.innerHeight * 0.55;
        if (!onScreen && !el.closest("header")) {
          const tall = rect.height > window.innerHeight * 0.5;
          el.scrollIntoView({ block: tall ? "start" : "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        }
      } else if (++tries > 30) {
        clearInterval(timer);
      }
    }, 100);
    return () => {
      clearInterval(timer);
      marked?.removeAttribute("data-tour-active");
    };
  }, [target, pathname]);
}

/** The demo's step-through guide: a card at the bottom of the screen that walks the app's pages. */
export function DemoTour() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const firstCourseId = useStore((s) => s.courses[0]?.id);
  const step = useSyncExternalStore(subscribe, readStep, () => null);

  const current = step === null ? undefined : STEPS[step];
  useHighlight(current?.target, pathname);

  const goTo = useCallback(
    (index: number) => {
      const next = STEPS[index];
      const path = typeof next.path === "function" ? next.path(firstCourseId) : next.path;
      writeStep(index);
      if (!path) return;
      const [route, hash] = path.split("#");
      if (route === window.location.pathname) {
        if (hash !== undefined && window.location.hash !== `#${hash}`) {
          // Same page: the settings page follows its hash through this event (see app/beallitasok).
          history.replaceState(null, "", `#${hash}`);
          window.dispatchEvent(new Event("settings-hash"));
        }
        if (hash === undefined) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      } else {
        // Start the new page from its top (the previous step may have scrolled far down).
        window.scrollTo(0, 0);
        router.push(path);
      }
    },
    [router, firstCourseId]
  );

  if (step === null || !current) return null;
  const copy = t.demo.steps[current.key];
  const last = step === STEPS.length - 1;

  return (
    <aside
      aria-label={t.demo.tourLabel}
      aria-live="polite"
      className="sheet-paper fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 p-5 md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-fine font-semibold tabular-nums text-muted">{t.demo.step(step + 1, STEPS.length)}</span>
        <IconButton onClick={() => writeStep(null)} aria-label={t.demo.close} title={t.demo.close} className="-mr-2 -mt-1">
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      {current.locked && <NeedsAccountStamp />}
      <h2 className="font-display text-subhead leading-tight text-heading">{copy.title}</h2>
      <p className="text-body text-foreground">{copy.body}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        {step > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => goTo(step - 1)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t.demo.back}
          </Button>
        ) : (
          <span />
        )}
        {last ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => writeStep(null)}>
              {t.demo.keepExploring}
            </Button>
            <Button type="button" size="sm" onClick={registerFromDemo}>
              {t.demo.register}
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" onClick={() => goTo(step + 1)}>
            {t.demo.next}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </aside>
  );
}
