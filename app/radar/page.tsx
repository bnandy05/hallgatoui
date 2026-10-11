"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Flame, SlidersHorizontal } from "lucide-react";
import { useStore } from "@/lib/store";
import { useDataReady } from "@/lib/useDataReady";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { getPlatform, platformName } from "@/lib/platforms";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { groupByWeek, isCritical, isRecentlyChanged, urgencyOf, weekRangeLabel } from "@/lib/radar";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Select } from "@/components/ui/Select";
import { DeadlineChip } from "@/components/week/DeadlineChip";
import { DayAgenda } from "@/components/week/DayAgenda";

const NO_COURSE = "__none__";

function RadarSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-14 rounded-[var(--radius-slip)] bg-strip/80" />
      <div className="h-56 rounded-[var(--radius-slip)] bg-strip/80" />
      <div className="h-56 rounded-[var(--radius-slip)] bg-strip/80" />
    </div>
  );
}

export default function WeekRadarPage() {
  const t = useT();
  const locale = useLocale();
  const hydrated = useDataReady();
  const courses = useStore((s) => s.courses);
  const { visible: deadlines } = useDedupedDeadlines();
  const customPlatforms = useStore((s) => s.customPlatforms);

  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [now] = useState(() => new Date());

  const courseChips = useMemo(() => {
    const chips = courses.map((c) => ({ id: c.id, name: c.name, color: c.color }));
    if (deadlines.some((d) => d.courseId === null)) {
      chips.push({ id: NO_COURSE, name: t.radar.noCourse, color: "var(--pin-neutral)" });
    }
    return chips;
  }, [courses, deadlines, t]);

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
      weeks: groupByWeek(filtered.filter((d) => !isOverdue(d)), now, locale),
    };
  }, [filtered, now, locale]);

  const filtersActive =
    selectedCourses.size > 0 || showDone || criticalOnly || platformFilter !== "";
  const toggleCount = [showDone, criticalOnly, platformFilter !== ""].filter(Boolean).length;

  function clearFilters() {
    setSelectedCourses(new Set());
    setShowDone(false);
    setCriticalOnly(false);
    setPlatformFilter("");
  }

  // The non-course filters: in the sidebar from lg, in a bottom sheet below it.
  const toggles = (
    <>
      <Pill active={criticalOnly} onClick={() => setCriticalOnly((v) => !v)} className="self-start">
        <Flame className="h-3.5 w-3.5" />
        {t.radar.criticalOnly}
      </Pill>
      <label className="flex items-center gap-2 text-[14px] text-foreground">
        <input
          type="checkbox"
          checked={showDone}
          onChange={(e) => setShowDone(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        {t.radar.showDone}
      </label>
      <Select
        value={platformFilter}
        onChange={(e) => setPlatformFilter(e.target.value)}
        className="!py-1.5"
        aria-label={t.radar.platform}
      >
        <option value="">{t.radar.allPlatforms}</option>
        {platformsInUse.map((p) => (
          <option key={p.id} value={p.id}>
            {platformName(p, t.platforms.other)}
          </option>
        ))}
      </Select>
    </>
  );

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <SectionHeading
        as="h1"
        title={t.radar.title}
        sub={
          !hydrated ? (
            "\u00a0"
          ) : horizon.open === 0 ? (
            t.radar.noOpen
          ) : (
            <>
              {t.radar.openCount(horizon.open)}
              {horizon.critical > 0 && (
                <>
                  {t.radar.ofWhich}
                  <span className="font-semibold text-danger">{t.radar.criticalCount(horizon.critical)}</span>
                </>
              )}
              {horizon.changed > 0 && (
                <>
                  {t.radar.changedPrefix}
                  <span className="font-semibold text-warning">{t.radar.changedCount(horizon.changed)}</span>
                  {t.radar.changedSuffix}
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <div
            role="search"
            aria-label={t.radar.filters}
            className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[88px] lg:gap-4 lg:self-start lg:rounded-[var(--radius-slip)] lg:bg-card lg:px-4 lg:py-4 lg:shadow-[var(--shadow-sheet)]"
          >
            <div className="hidden lg:flex lg:flex-col lg:gap-3">{toggles}</div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-t lg:border-border lg:px-0 lg:pt-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold lg:hidden ${
                  toggleCount > 0 ? "border-accent bg-accent text-accent-ink" : "border-border-strong bg-card text-heading"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t.radar.filters}
                {toggleCount > 0 && <span className="tabular-nums">· {toggleCount}</span>}
              </button>
              {courseChips.map((chip) => {
                const active = selectedCourses.has(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCourse(chip.id)}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13.5px] font-medium transition-colors duration-150 lg:w-full lg:rounded-[var(--radius)] lg:border-transparent lg:px-2.5 lg:text-left lg:text-[14px] ${
                      active
                        ? "border-accent bg-accent text-accent-ink hover:bg-accent-hover"
                        : "border-border bg-card text-muted hover:border-border-strong hover:text-heading lg:bg-transparent lg:hover:bg-wash/[0.05]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-card/60"
                      style={{ backgroundColor: chip.color }}
                    />
                    <span className="lg:truncate">{chip.name}</span>
                  </button>
                );
              })}
            </div>
            <p
              className={`flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums text-muted lg:flex lg:border-t lg:border-border lg:pt-3 ${
                filtersActive ? "" : "hidden"
              }`}
            >
              {t.radar.results(filtered.length)}
              {filtersActive && (
                <button type="button" onClick={clearFilters} className="ml-auto font-semibold text-heading underline">
                  {t.radar.clearFilters}
                </button>
              )}
            </p>
          </div>

          <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t.radar.filters}>
            <div className="flex flex-col gap-4">{toggles}</div>
            <DialogActions>
              <Button type="button" variant="secondary" onClick={clearFilters} disabled={!filtersActive}>
                {t.radar.clearFilters}
              </Button>
              <Button type="button" onClick={() => setFiltersOpen(false)}>
                {t.radar.showResults(filtered.length)}
              </Button>
            </DialogActions>
          </Dialog>

          <div className="min-w-0">
            {overdue.length === 0 && weeks.length === 0 ? (
              <p className="text-[15px] text-muted">
                {filtersActive ? t.radar.noneMatch : t.radar.noneToShow}
              </p>
            ) : (
              <div className="flex flex-col gap-10">
                {overdue.length > 0 && (
                  <section
                    aria-labelledby="overdue-heading"
                    className="flex flex-col gap-4 rounded-[var(--radius-slip)] bg-salmon px-3 pb-4 pt-3 sm:px-4"
                  >
                    <h2 id="overdue-heading" className="flex items-baseline gap-2">
                      <span className="font-display text-[24px] text-danger">{t.radar.overdue}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-danger">{overdue.length}</span>
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
                      {overdue.map((d, i) => (
                        <DeadlineChip key={d.id} deadline={d} now={now} showDate index={i} />
                      ))}
                    </div>
                  </section>
                )}

                {weeks.map((week, wi) => (
                  <section
                    key={week.weekStart.toISOString()}
                    className="flex flex-col gap-3"
                    aria-label={week.label}
                    style={{ "--seq": wi + 1 } as CSSProperties}
                  >
                    <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-[clamp(22px,2.6vw,28px)] text-heading">
                        {week.label.charAt(0).toUpperCase() + week.label.slice(1)}
                      </span>
                      {!/\d/.test(week.label) && (
                        <span className="text-[14px] text-muted">{weekRangeLabel(week.weekStart, dateLocale(locale), t.formats.weekRange)}</span>
                      )}
                      <span className="text-[13px] tabular-nums text-muted-dim">{t.radar.weekCount(week.items.length)}</span>
                    </h2>
                    <DayAgenda weekStart={week.weekStart} deadlines={week.items} now={now} />
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
