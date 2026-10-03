"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus, CalendarRange, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { visibleSessions } from "@/lib/ical/neptun";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { addDays } from "date-fns";
import { weekRangeLabel, weekStartOf, weekSummary } from "@/lib/radar";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CourseDialog } from "@/components/CourseDialog";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DiscoveryBanner } from "@/components/DiscoveryBanner";
import { TimetableBanner } from "@/components/TimetableBanner";
import { Pill } from "@/components/ui/Pill";
import { CourseTable } from "@/components/week/CourseTable";
import { WeekBoard } from "@/components/week/WeekBoard";
import { WeekNav } from "@/components/week/WeekNav";

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-64 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-40 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
    </div>
  );
}

export default function WeekHome() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const { visible: deadlines } = useDedupedDeadlines();
  const loadDemo = useStore((s) => s.loadDemo);
  const allSessions = useStore((s) => s.classSessions);
  const timetableSources = useStore((s) => s.timetableSources);
  const classSessions = useMemo(() => visibleSessions(allSessions, timetableSources), [allSessions, timetableSources]);
  const showClasses = useStore((s) => s.showClasses);
  const setShowClasses = useStore((s) => s.setShowClasses);
  const [now] = useState(() => new Date());
  const currentWeekStart = useMemo(() => weekStartOf(now), [now]);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [courseOpen, setCourseOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);

  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();
  const summary = useMemo(() => weekSummary(deadlines, now), [deadlines, now]);
  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.name.localeCompare(b.name, "hu")),
    [courses]
  );
  const range = weekRangeLabel(weekStart);
  const nextWeekStart = addDays(currentWeekStart, 7);
  const nextWeekCount = deadlines.filter((d) => {
    const due = new Date(d.due).getTime();
    return !d.done && due >= nextWeekStart.getTime() && due < addDays(nextWeekStart, 7).getTime();
  }).length;

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      <section className="flex flex-col gap-5" aria-labelledby="week-heading">
        <SectionHeading
          as="h1"
          eyebrow="Heti menetrend"
          icon={CalendarRange}
          title={
            <span id="week-heading">
              {isCurrent ? (
                <>
                  Ez a hét: <span className="grad">{range}</span>
                </>
              ) : (
                range
              )}
            </span>
          }
          sub={
            isCurrent ? (
              <>
                {summary.total} határidő jár le a héten, ebből{" "}
                <span className={summary.critical > 0 ? "font-semibold text-danger" : undefined}>
                  {summary.critical} kritikus
                </span>
                .
              </>
            ) : (
              "Egy másik hét a menetrendből. A lejárt elemek az aktuális hétnél vannak."
            )
          }
          aside="(A határidő közelebb van, mint amilyennek a naptárban látszik.)"
          actions={
            <>
              {hydrated && classSessions.length > 0 && (
                <Pill
                  active={showClasses}
                  onClick={() => setShowClasses(!showClasses)}
                  title="Az órarendi órák megjelenítése a heti menetrendben"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Órák
                </Pill>
              )}
              <WeekNav
                weekStart={weekStart}
                currentWeekStart={currentWeekStart}
                onChange={setWeekStart}
              />
              <Button type="button" onClick={() => setDeadlineOpen(true)}>
                <Plus className="h-4 w-4" />
                Határidő
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCourseOpen(true)}>
                <Plus className="h-4 w-4" />
                Tárgy
              </Button>
            </>
          }
        />

        {!hydrated ? (
          <HomeSkeleton />
        ) : (
          <>
            <DiscoveryBanner />
            <TimetableBanner />
            <WeekBoard
              weekStart={weekStart}
              deadlines={deadlines}
              sessions={showClasses ? classSessions : undefined}
              now={now}
              gutter={isCurrent}
              intro
              label={`Heti menetrend, ${range}`}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              {deadlines.length === 0 ? (
                <p className="text-muted">
                  Még nincs határidőd.{" "}
                  <Link
                    href="/beallitasok#naptarak"
                    className="text-accent-text hover:underline"
                  >
                    Kösd be a Canvas/Moodle naptárad
                  </Link>
                  , és magától megtelik.
                </p>
              ) : (
                <p className="text-muted-dim">Pipáld ki, ami kész. A címre kattintva minden részlet.</p>
              )}
              <Link
                href="/radar"
                className="font-medium text-accent-text hover:underline"
              >
                {isCurrent ? `Jövő hét: ${nextWeekCount} határidő · radar →` : "Több hét a radaron →"}
              </Link>
            </div>
          </>
        )}
      </section>

      {hydrated && (
        <section className="flex flex-col gap-5">
          <SectionHeading
            eyebrow="Tárgyaim"
            icon={LayoutGrid}
            title="Egy kattintás a platformig."
            sub="Minden tárgy egy sor: a platformjai, a következő határideje és hogy hány dolog van még nyitva."
          />
          {sortedCourses.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="Még üres a füzet"
              text="Add hozzá a Canvas/Moodle naptárad, és a tárgyakat automatikusan felvesszük."
              action={
                <>
                  <Button onClick={() => setCourseOpen(true)}>Új tárgy</Button>
                  <Link
                    href="/beallitasok#naptarak"
                    className={buttonClasses({ variant: "secondary" })}
                  >
                    <CalendarPlus className="h-4 w-4" />
                    Naptár importálása
                  </Link>
                  <Button variant="secondary" onClick={loadDemo}>
                    <Sparkles className="h-4 w-4" />
                    Demo adatok betöltése
                  </Button>
                </>
              }
            />
          ) : (
            <Reveal>
              <CourseTable courses={sortedCourses} now={now} />
            </Reveal>
          )}
        </section>
      )}

      <CourseDialog open={courseOpen} onClose={() => setCourseOpen(false)} />
      <DeadlineDialog open={deadlineOpen} onClose={() => setDeadlineOpen(false)} />
    </div>
  );
}
