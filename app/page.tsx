"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CourseCard } from "@/components/CourseCard";
import { CourseDialog } from "@/components/CourseDialog";
import { RadarWidget } from "@/components/RadarWidget";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

function CourseGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-lg border border-border bg-border/40"
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Tárgyaim</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Új tárgy
        </Button>
      </div>

      {!hydrated ? (
        <CourseGridSkeleton />
      ) : (
        <>
          <RadarWidget />

          {sortedCourses.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="Még nincs tárgyad"
              action={
                <>
                  <Button onClick={() => setCreateOpen(true)}>Új tárgy</Button>
                  <Button variant="secondary" onClick={loadDemo}>
                    <Sparkles className="h-4 w-4" />
                    Demo adatok betöltése
                  </Button>
                </>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </>
      )}

      <CourseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
