"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlowField } from "@/components/ui/FlowField";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CourseCard } from "@/components/CourseCard";
import { CourseDialog } from "@/components/CourseDialog";
import { DiscoveryBanner } from "@/components/DiscoveryBanner";
import { RadarWidget } from "@/components/RadarWidget";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

function CourseGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-[var(--radius)] border border-border bg-border/40"
        />
      ))}
    </div>
  );
}

export default function Home() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const loadDemo = useStore((s) => s.loadDemo);
  const [createOpen, setCreateOpen] = useState(false);

  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.name.localeCompare(b.name, "hu")),
    [courses]
  );

  return (
    <div className="flex flex-col gap-8 sm:gap-12">
      <div className="relative overflow-hidden py-6">
        <FlowField />
        <div className="relative">
          <SectionHeading
            as="h1"
            eyebrow="Tárgyaim"
            icon={LayoutGrid}
            title={
              <>
                Minden tárgyad, <span className="grad">egy fedélzeten</span>.
              </>
            }
            sub="Linkek, anyagok és határidők egy helyen, a saját böngésződben tárolva."
            aside="(Odüsszeusz tíz évig hajózott hazafelé. Neked csak egy félév jutott.)"
            actions={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Új tárgy
              </Button>
            }
          />
        </div>
      </div>

      {!hydrated ? (
        <CourseGridSkeleton />
      ) : (
        <>
          <DiscoveryBanner />
          <RadarWidget />

          {sortedCourses.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="Még üres a fedélzet"
              text="Add hozzá a Canvas/Moodle naptárad, és a tárgyakat automatikusan felvesszük."
              aside="(Az első tárgy a legnehezebb. Utána már csak a ZH-k.)"
              action={
                <>
                  <Button onClick={() => setCreateOpen(true)}>Új tárgy</Button>
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
            <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </Reveal>
          )}
        </>
      )}

      <CourseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
