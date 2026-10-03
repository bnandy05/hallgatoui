"use client";

import { useMemo, useState } from "react";
import { Flame, Plus, Radar } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { getPlatform } from "@/lib/platforms";
import { groupByWeek, isCritical, isRecentlyChanged, urgencyOf, weekRangeLabel } from "@/lib/radar";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Select } from "@/components/ui/Select";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { DeadlineChip } from "@/components/week/DeadlineChip";
import { WeekBoard } from "@/components/week/WeekBoard";

const NO_COURSE = "__none__";

function RadarSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-14 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-56 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
      <div className="h-56 animate-pulse rounded-[var(--radius)] border border-border bg-border/40" />
    </div>
  );
}

export default function WeekRadarPage() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const { visible: deadlines } = useDedupedDeadlines();
  const customPlatforms = useStore((s) => s.customPlatforms);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("");
  const [now] = useState(() => new Date());

  const courseChips = useMemo(() => {
    const chips = courses.map((c) => ({ id: c.id, name: c.name, color: c.color }));
    if (deadlines.some((d) => d.courseId === null)) {
      chips.push({ id: NO_COURSE, name: "Nincs tárgy", color: "#6a7c96" });
    }
    return chips;
  }, [courses, deadlines]);

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === courseChips.length ? new Set() : next;
    });
  }

  const horizon = useMemo(() => {
    const open = deadlines.filter((d) => !d.done);
    return {
      open: open.length,
      critical: open.filter((d) => isCritical(d, now)).length,
      changed: open.filter((d) => d.previousDue && isRecentlyChanged(d, now)).length,
    };
  }, [deadlines, now]);

  const filtered = useMemo(
    () =>
      deadlines.filter((d) => {
        if (!showDone && d.done) return false;
        if (criticalOnly && !isCritical(d, now)) return false;
        if (selectedCourses.size > 0 && !selectedCourses.has(d.courseId ?? NO_COURSE)) return false;
        if (platformFilter && d.platformId !== platformFilter) return false;
        return true;
      }),
    [deadlines, showDone, criticalOnly, selectedCourses, platformFilter, now]
  );

  const { overdue, weeks } = useMemo(() => {
    const isOverdue = (d: (typeof filtered)[number]) => urgencyOf(d, now) === "overdue";
    return {
      overdue: filtered
        .filter(isOverdue)
        .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()),
      weeks: groupByWeek(filtered.filter((d) => !isOverdue(d)), now),
    };
  }, [filtered, now]);

  const filtersActive =
    selectedCourses.size > 0 || showDone || criticalOnly || platformFilter !== "";

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <SectionHeading
        as="h1"
        eyebrow="Határidő-radar"
        icon={Radar}
        title={
          <>
            Ami közeleg, azt <span className="grad">látod</span>.
          </>
        }
        sub="Minden hét egy tábla, hétfőtől vasárnapig. A lejárt elemek legfelül várnak."
        actions={
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Határidő
          </Button>
        }
      />

      {!hydrated ? (
        <RadarSkeleton />
      ) : (
        <>
          <p className="-mt-2 text-sm text-muted sm:-mt-4">
            A teljes láthatár: {horizon.open} nyitott elem
            {horizon.critical > 0 && (
              <>
                , ebből <span className="font-semibold text-danger">{horizon.critical} kritikus</span>
              </>
            )}
            {horizon.changed > 0 && (
              <>
                , <span className="text-warning">{horizon.changed} módosult</span> az elmúlt 48 órában
              </>
            )}
            .
          </p>

          <div
            role="search"
            aria-label="Szűrők"
            className="sticky top-[68px] z-[5] flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-[rgba(20,28,46,0.94)] px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-[10px]"
          >
            {courseChips.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible">
                {courseChips.map((chip) => {
                  const active = selectedCourses.size === 0 || selectedCourses.has(chip.id);
                  return (
                    <Pill
                      key={chip.id}
                      active={active}
                      onClick={() => toggleCourse(chip.id)}
                      className="shrink-0"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: chip.color }}
                      />
                      {chip.name}
                    </Pill>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Pill active={criticalOnly} onClick={() => setCriticalOnly((v) => !v)}>
                <Flame className="h-3.5 w-3.5" />
                Csak kritikus
              </Pill>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Kész elemek is
              </label>
              <Select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="!w-auto max-w-[14rem] !py-1.5"
                aria-label="Platform szűrő"
              >
                <option value="">Minden platform</option>
                {platformsInUse.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <span className="ml-auto text-xs tabular-nums text-muted">
                {filtered.length} elem
                {filtersActive && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCourses(new Set());
                        setShowDone(false);
                        setCriticalOnly(false);
                        setPlatformFilter("");
                      }}
                      className="text-accent-text hover:underline"
                    >
                      szűrők törlése
                    </button>
                  </>
                )}
              </span>
            </div>
          </div>

          {overdue.length === 0 && weeks.length === 0 ? (
            <p className="text-sm text-muted">
              Nincs megjeleníthető határidő.{" "}
              <span className="text-[11.5px] text-muted-dim">(Gyanúsan üres a lap. Biztos, hogy minden be van írva?)</span>
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {overdue.length > 0 && (
                <Reveal>
                  <section
                    aria-labelledby="overdue-heading"
                    className="flex flex-col gap-3 rounded-[var(--radius)] border border-danger/40 bg-danger/[0.06] p-4"
                  >
                    <h2
                      id="overdue-heading"
                      className="flex items-baseline gap-2 text-xs font-bold uppercase tracking-[0.12em] text-danger"
                    >
                      Lejárt
                      <span className="font-normal tabular-nums text-danger/80">{overdue.length}</span>
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
                      {overdue.map((d) => (
                        <DeadlineChip key={d.id} deadline={d} now={now} showDate />
                      ))}
                    </div>
                  </section>
                </Reveal>
              )}

              {weeks.map((week) => (
                <Reveal key={week.weekStart.toISOString()}>
                  <section className="flex flex-col gap-3" aria-label={week.label}>
                    <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[clamp(17px,2.2vw,21px)] font-bold text-heading">
                        {week.label}
                      </span>
                      {!/\d/.test(week.label) && (
                        <span className="text-sm text-muted">{weekRangeLabel(week.weekStart)}</span>
                      )}
                      <span className="text-xs tabular-nums text-muted-dim">
                        {week.items.length} elem
                      </span>
                    </h2>
                    <WeekBoard
                      weekStart={week.weekStart}
                      deadlines={week.items}
                      now={now}
                      label={week.label}
                      hideEmptyDays
                      dense
                    />
                  </section>
                </Reveal>
              ))}
            </div>
          )}
        </>
      )}

      <DeadlineDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
