"use client";

import { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { getPlatform } from "@/lib/platforms";
import { groupByWeek, isCritical, isRecentlyChanged, urgencyOf, weekRangeLabel } from "@/lib/radar";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Select } from "@/components/ui/Select";
import { DeadlineChip } from "@/components/week/DeadlineChip";
import { WeekBoard } from "@/components/week/WeekBoard";

const NO_COURSE = "__none__";

function RadarSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-14 animate-pulse rounded-[var(--radius-slip)] bg-white/40" />
      <div className="h-56 animate-pulse rounded-[var(--radius-slip)] bg-white/40" />
      <div className="h-56 animate-pulse rounded-[var(--radius-slip)] bg-white/40" />
    </div>
  );
}

export default function WeekRadarPage() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const { visible: deadlines } = useDedupedDeadlines();
  const customPlatforms = useStore((s) => s.customPlatforms);

  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("");
  const [now] = useState(() => new Date());

  const courseChips = useMemo(() => {
    const chips = courses.map((c) => ({ id: c.id, name: c.name, color: c.color }));
    if (deadlines.some((d) => d.courseId === null)) {
      chips.push({ id: NO_COURSE, name: "Tárgy nélkül", color: "var(--pin-neutral)" });
    }
    return chips;
  }, [courses, deadlines]);

  const platformsInUse = useMemo(() => {
    const ids = new Set(
      deadlines.map((d) => d.platformId).filter((id): id is string => Boolean(id))
    );
    return Array.from(ids).map((id) => getPlatform(id, customPlatforms));
  }, [deadlines, customPlatforms]);

  // No selection means every course. The first click narrows to that one course; clearing the
  // last selected course goes back to every course.
  function toggleCourse(id: string) {
    setSelectedCourses((prev) => {
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
        title="Határidők"
        sub={
          !hydrated ? (
            "\u00a0"
          ) : horizon.open === 0 ? (
            "Nincs nyitott határidőd."
          ) : (
            <>
              {horizon.open} nyitott határidő
              {horizon.critical > 0 && (
                <>
                  , ebből <span className="font-semibold text-danger">{horizon.critical} kritikus</span>
                </>
              )}
              {horizon.changed > 0 && (
                <>
                  ; <span className="font-semibold text-warning">{horizon.changed} módosult</span> az elmúlt 48 órában
                </>
              )}
              .
            </>
          )
        }
      />

      {!hydrated ? (
        <RadarSkeleton />
      ) : (
        <>
          <div
            role="search"
            aria-label="Szűrők"
            className="sheet-paper sticky top-[72px] z-[5] flex flex-col gap-3 px-4 py-3"
          >
            {courseChips.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
                {courseChips.map((chip) => {
                  const active = selectedCourses.has(chip.id);
                  return (
                    <Pill
                      key={chip.id}
                      active={active}
                      onClick={() => toggleCourse(chip.id)}
                      className="shrink-0"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/60"
                        style={{ backgroundColor: chip.color }}
                      />
                      {chip.name}
                    </Pill>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
              <Pill active={criticalOnly} onClick={() => setCriticalOnly((v) => !v)}>
                <Flame className="h-3.5 w-3.5" />
                Csak kritikus
              </Pill>
              <label className="flex items-center gap-2 text-[14px] text-foreground">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Készek is
              </label>
              <Select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="!w-auto max-w-[14rem] !py-1.5"
                aria-label="Platform"
              >
                <option value="">Minden platform</option>
                {platformsInUse.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <span className="ml-auto text-[13px] tabular-nums text-muted">
                {filtered.length} találat
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
                      className="font-semibold text-heading underline"
                    >
                      Szűrők törlése
                    </button>
                  </>
                )}
              </span>
            </div>
          </div>

          {overdue.length === 0 && weeks.length === 0 ? (
            <p className="text-[15px] text-muted">
              {filtersActive ? "A szűrőknek egy határidő sem felel meg." : "Nincs megjeleníthető határidő."}
            </p>
          ) : (
            <div className="flex flex-col gap-10">
              {overdue.length > 0 && (
                <div>
                  <section
                    aria-labelledby="overdue-heading"
                    className="relative flex flex-col gap-4 rounded-[var(--radius-slip)] bg-salmon px-4 pb-5 pt-4"
                  >
                    <h2 id="overdue-heading" className="flex items-baseline gap-2">
                      <span className="font-display text-[24px] text-danger">Lejárt</span>
                      <span className="text-[13px] font-semibold tabular-nums text-danger">{overdue.length}</span>
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
                      {overdue.map((d) => (
                        <DeadlineChip key={d.id} deadline={d} now={now} showDate />
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {weeks.map((week) => (
                <div key={week.weekStart.toISOString()}>
                  <section className="flex flex-col gap-4" aria-label={week.label}>
                    <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-[clamp(22px,2.6vw,28px)] text-heading">
                        {week.label.charAt(0).toUpperCase() + week.label.slice(1)}
                      </span>
                      {!/\d/.test(week.label) && (
                        <span className="text-[14px] text-muted">{weekRangeLabel(week.weekStart)}</span>
                      )}
                      <span className="text-[13px] tabular-nums text-muted-dim">
                        {week.items.length} határidő
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
