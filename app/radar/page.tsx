"use client";

import { useMemo, useState } from "react";
import { Plus, Radar } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { getPlatform } from "@/lib/platforms";
import { groupByWeek, urgencyOf, weekSummary } from "@/lib/radar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Pill } from "@/components/ui/Pill";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { WeekSummaryTerminal } from "@/components/WeekSummaryTerminal";
import { Select } from "@/components/ui/Select";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DeadlineItem } from "@/components/DeadlineItem";

const NO_COURSE = "__none__";

function RadarSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-48 animate-pulse rounded-md bg-border/40" />
      <div className="h-16 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-40 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
    </div>
  );
}

export default function RadarPage() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const deadlines = useStore((s) => s.deadlines);
  const customPlatforms = useStore((s) => s.customPlatforms);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("");
  const [now] = useState(() => new Date());

  const hasUnassigned = useMemo(
    () => deadlines.some((d) => d.courseId === null),
    [deadlines]
  );

  const courseChips = useMemo(() => {
    const chips = courses.map((c) => ({ id: c.id, name: c.name, color: c.color }));
    if (hasUnassigned) {
      chips.push({ id: NO_COURSE, name: "Nincs tárgy", color: "#6a7c96" });
    }
    return chips;
  }, [courses, hasUnassigned]);

  const platformsInUse = useMemo(() => {
    const ids = new Set(
      deadlines.map((d) => d.platformId).filter((id): id is string => Boolean(id))
    );
    return Array.from(ids).map((id) => getPlatform(id, customPlatforms));
  }, [deadlines, customPlatforms]);

  function toggleCourse(id: string) {
    setSelectedCourses((prev) => {
      if (prev.size === 0) {
        const next = new Set(courseChips.map((c) => c.id));
        next.delete(id);
        return next;
      }
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === courseChips.length) {
        return new Set();
      }
      return next;
    });
  }

  const summary = useMemo(() => weekSummary(deadlines, now), [deadlines, now]);

  const filtered = useMemo(() => {
    return deadlines.filter((d) => {
      if (!showDone && d.done) return false;
      const courseKey = d.courseId ?? NO_COURSE;
      if (selectedCourses.size > 0 && !selectedCourses.has(courseKey)) return false;
      if (platformFilter && d.platformId !== platformFilter) return false;
      return true;
    });
  }, [deadlines, showDone, selectedCourses, platformFilter]);

  const { overdueItems, groups } = useMemo(() => {
    const overdue = filtered
      .filter((d) => urgencyOf(d, now) === "overdue")
      .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    const rest = filtered.filter((d) => urgencyOf(d, now) !== "overdue");
    return { overdueItems: overdue, groups: groupByWeek(rest, now) };
  }, [filtered, now]);

  if (!hydrated) {
    return <RadarSkeleton />;
  }

  const nothingToShow = overdueItems.length === 0 && groups.length === 0;

  return (
    <div className="flex flex-col gap-8 sm:gap-12">
      <SectionHeading
        as="h1"
        eyebrow="Határidő-radar"
        icon={Radar}
        title={
          <>
            Ami közeleg, azt <span className="grad">látod</span>.
          </>
        }
        sub="Hetekre bontva, sürgősség szerint. Semmi nem lopakodik mögéd."
        aside="(A szirének is határidőket énekelnek. Kösd magad az árbochoz.)"
        actions={
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Határidő
          </Button>
        }
      />

      <WeekSummaryTerminal total={summary.total} critical={summary.critical} />

      <Card className="flex flex-col gap-3 !p-4">
        {courseChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {courseChips.map((chip) => {
              const active = selectedCourses.size === 0 || selectedCourses.has(chip.id);
              return (
                <Pill key={chip.id} active={active} onClick={() => toggleCourse(chip.id)}>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: chip.color }}
                  />
                  {chip.name}
                </Pill>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Kész elemek mutatása
          </label>

          <Select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="max-w-xs"
            aria-label="Platform szűrő"
          >
            <option value="">Minden platform</option>
            {platformsInUse.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {nothingToShow ? (
        <p className="text-sm text-muted">
          Nincs megjeleníthető határidő.{" "}
          <span className="text-[11.5px] text-muted-dim">(Gyanúsan nyugodt a tenger.)</span>
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {overdueItems.length > 0 && (
            <Reveal className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="sticky top-20 self-start">
                <Eyebrow className="!text-danger">Lejárt</Eyebrow>
              </div>
              <div className="flex flex-col gap-2">
                {overdueItems.map((d) => (
                  <DeadlineItem key={d.id} deadline={d} />
                ))}
              </div>
            </Reveal>
          )}

          {groups.map((group) => (
            <Reveal
              key={group.weekStart.toISOString()}
              className="grid gap-3 sm:grid-cols-[10rem_1fr]"
            >
              <div className="sticky top-20 self-start">
                <Eyebrow>{group.label}</Eyebrow>
              </div>
              <div className="flex flex-col gap-2">
                {group.items.map((d) => (
                  <DeadlineItem key={d.id} deadline={d} />
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      )}

      <DeadlineDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
