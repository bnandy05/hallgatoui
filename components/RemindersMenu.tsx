"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Bell, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { buildReminders } from "@/lib/reminders";
import { formatRelative, urgencyOf } from "@/lib/radar";
import { openCatchUp } from "@/lib/catchupEvents";
import { instanceLabel, instanceSnapshot, shortDayLabel } from "@/lib/rules/instances";
import { filterAlerts, gradeAlerts, type GradeAlert } from "@/lib/gradeAlerts";
import { bellKinds } from "@/lib/alertPrefs";
import { resultId } from "@/lib/rules/types";
import { budapestTime } from "@/lib/ical/budapest";
import { canAwait, RESULT_EXPECTED_DAYS, type CatchUpField, type CatchUpGroup } from "@/lib/catchup";
import { useCatchUpData } from "@/lib/useCatchUp";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import type { Deadline } from "@/lib/types";
import { buttonClasses } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { DeadlineDetailDialog } from "@/components/DeadlineItem";
import { InstanceInput, type ResultPatch } from "@/components/requirements/InstanceInput";

// The header's bell: what needs recording (a class or test with one or two fields is filled in
// right here; "Még nincs" moves it to "Eredményre vár"), results still to come, courses at risk,
// hot deadlines and exams known from the rules. Everything is derived from the store on every
// render; nothing is stored.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Groups with at most this many fields are filled in inside the bell. */
const INLINE_FIELDS = 2;

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-small font-bold text-heading">{title}</h3>
        {action}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function groupText(group: CatchUpGroup, courseName: string | undefined, locale: Locale): { title: string; sub: string } {
  const what = group.fields.map((f) => f.target.label.toLowerCase()).join(", ");
  if (group.deadline) return { title: group.deadline.title, sub: `${courseName ? `${courseName} · ` : ""}${what}` };
  return {
    title: courseName ?? group.session?.subject ?? group.fields[0].target.label,
    sub: `${instanceLabel(group.fields[0].instance, locale)}: ${what}`,
  };
}

function alertIcon(a: GradeAlert, className: string): ReactNode {
  if (a.kind === "opportunity") return <TrendingUp aria-hidden="true" className={className} />;
  if (a.kind === "change") {
    return a.severity === "warning" ? <TrendingDown aria-hidden="true" className={className} /> : <CheckCircle2 aria-hidden="true" className={className} />;
  }
  return <AlertTriangle aria-hidden="true" className={className} />;
}

/** One grade alert: course (fine, muted), the text (small; red for danger, warning colour, else ink), the date. */
function AlertRow({ alert, course, locale, onNavigate }: { alert: GradeAlert; course: string | undefined; locale: Locale; onNavigate: () => void }) {
  const tone = alert.severity === "danger" ? "font-semibold text-danger" : alert.severity === "warning" ? "text-warning" : "text-foreground";
  return (
    <li className="py-1.5">
      <Link href={`/targy/${alert.courseId}#course-requirements`} onClick={onNavigate} className="flex items-start gap-2 hover:underline">
        {alertIcon(alert, `mt-0.5 h-3.5 w-3.5 shrink-0 ${alert.severity === "danger" ? "text-danger" : alert.severity === "warning" ? "text-warning" : "text-foreground"}`)}
        <span className="min-w-0">
          <span className="block truncate text-fine text-muted">{course}</span>
          <span className={`block text-small ${tone}`}>{alert.text}</span>
          {alert.due && <span className="block text-fine tabular-nums text-muted">{shortDayLabel(new Date(alert.due), locale)}</span>}
        </span>
      </Link>
    </li>
  );
}

export function RemindersMenu() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Deadline | null>(null);
  const courses = useStore((s) => s.courses);
  const results = useStore((s) => s.requirementResults);
  const setItems = useStore((s) => s.setRequirementResults);
  const alertPrefs = useStore((s) => s.alertPrefs);
  const { pending, awaiting, assessments, input, now } = useCatchUpData();
  const { visible } = useDedupedDeadlines();
  const allAlerts = useMemo(() => gradeAlerts(input, locale), [input, locale]);
  const alerts = useMemo(() => filterAlerts(allAlerts, bellKinds(alertPrefs)), [allAlerts, alertPrefs]);
  const reminders = useMemo(
    () => buildReminders({ pending, awaiting, deadlines: visible, assessments, alerts, now }),
    [pending, awaiting, visible, assessments, alerts, now]
  );
  const resultById = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);

  function save(f: CatchUpField, patch: ResultPatch) {
    setItems([
      {
        courseId: f.courseId,
        componentId: f.target.id,
        instanceKey: f.instance.key,
        patch: patch && { ...patch, ...instanceSnapshot(f.instance, locale) },
      },
    ]);
  }
  const courseName = (id: string | null) => (id ? courses.find((c) => c.id === id)?.name : undefined);
  const close = useCallback((next: boolean) => setOpen(next), []);
  const empty =
    reminders.pending.length +
      reminders.awaiting.length +
      reminders.deadlines.length +
      reminders.assessments.length +
      reminders.alerts.length ===
    0;
  const urgent = reminders.awaiting.some((a) => a.overdue) || reminders.deadlines.some((d) => urgencyOf(d, now) === "overdue");
  const label = reminders.badge > 0 ? t.reminders.titleWithCount(reminders.badge) : t.reminders.title;

  function fill(groupKey?: string) {
    setOpen(false);
    openCatchUp(groupKey ? { groupKey } : {});
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={close}
        label={t.reminders.title}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={label}
            title={label}
            data-tour="reminders"
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors duration-150 hover:bg-card/60 hover:text-heading md:h-8 md:w-8"
          >
            <Bell className="h-[18px] w-[18px]" />
            {reminders.badge > 0 && (
              <span
                aria-hidden="true"
                className={`absolute -right-0.5 -top-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-fine font-bold tabular-nums text-accent-ink ${
                  urgent ? "bg-danger" : "bg-pin"
                }`}
              >
                {reminders.badge > 99 ? "99+" : reminders.badge}
              </span>
            )}
          </button>
        )}
      >
        <div className="px-4 pb-2 pt-3">
          <p className="font-display text-title text-heading">{t.reminders.title}</p>
        </div>
        {empty && <p className="px-4 pb-4 text-body text-muted">{t.reminders.none}</p>}

        {reminders.pending.length > 0 && (
          <Section
            title={t.reminders.pending}
            action={
              reminders.pending.length > 1 && (
                <button type="button" onClick={() => fill()} className="link-text text-fine">
                  {t.reminders.fillAll}
                </button>
              )
            }
          >
            {reminders.pending.slice(0, 6).map((g) => {
              const text = groupText(g, courseName(g.courseId), locale);
              const inline = g.fields.length <= INLINE_FIELDS;
              return (
                <li key={g.key} className="border-t border-border/60 py-2 first:border-t-0">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-foreground">{text.title}</span>
                      <span className="block truncate text-fine text-muted">{text.sub}</span>
                    </span>
                    {!inline && (
                      <button
                        type="button"
                        onClick={() => fill(g.key)}
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                      >
                        {t.reminders.fill}
                      </button>
                    )}
                  </div>
                  {inline &&
                    g.fields.map((f) => {
                      const result = resultById.get(resultId(f.courseId, f.target.id, f.instance.key));
                      return (
                        <div key={f.target.id} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          {g.fields.length > 1 && <span className="w-full text-fine font-semibold text-muted">{f.target.label}</span>}
                          <InstanceInput
                            target={f.target}
                            scale={f.scale}
                            result={result}
                            label={`${text.title}: ${f.target.label}`}
                            onChange={(patch) => save(f, patch)}
                          />
                          {canAwait(f) && !result && (
                            <button
                              type="button"
                              onClick={() => save(f, { state: "pending" })}
                              className={buttonClasses({ variant: "ghost", size: "sm", className: "text-muted hover:text-heading" })}
                            >
                              {t.reminders.notYet}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </li>
              );
            })}
            {reminders.pending.length > 6 && (
              <li className="py-1 text-fine text-muted">{t.reminders.andMore(reminders.pending.length - 6)}</li>
            )}
          </Section>
        )}

        {reminders.alerts.length > 0 && (
          <Section title={t.reminders.attention}>
            {reminders.alerts.map((a) => (
              <AlertRow key={a.key} alert={a} course={courseName(a.courseId)} locale={locale} onNavigate={() => setOpen(false)} />
            ))}
            {reminders.moreAlerts > 0 && <li className="py-1 text-fine text-muted">{t.reminders.andMore(reminders.moreAlerts)}</li>}
          </Section>
        )}

        {reminders.awaiting.length > 0 && (
          <Section title={t.reminders.awaiting}>
            {reminders.awaiting.slice(0, 6).map((a) => {
              const since = a.result.at ? Date.parse(a.result.at) : NaN;
              const expected = Number.isFinite(since) ? shortDayLabel(new Date(since + RESULT_EXPECTED_DAYS * DAY_MS), locale) : null;
              return (
                <li key={a.result.id} className="py-1.5">
                  <Link href={`/targy/${a.courseId}`} onClick={() => setOpen(false)} className="block hover:underline">
                    <span className="block truncate text-small font-semibold text-foreground">
                      {courseName(a.courseId)} · {a.componentLabel}
                    </span>
                    <span className={`block text-fine ${a.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                      {a.overdue ? t.reminders.shouldHaveArrived : expected ? t.reminders.expected(expected) : t.reminders.noResultYet}
                    </span>
                  </Link>
                </li>
              );
            })}
          </Section>
        )}

        {reminders.deadlines.length > 0 && (
          <Section
            title={t.reminders.upcoming}
            action={
              <Link href="/radar" onClick={() => setOpen(false)} className="link-text text-fine">
                {t.reminders.allDeadlines}
              </Link>
            }
          >
            {reminders.deadlines.map((d) => {
              const u = urgencyOf(d, now);
              const due = new Date(d.due);
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => setDetail(d)} className="block w-full py-1.5 text-left hover:underline">
                    <span className="block truncate text-small font-semibold text-foreground">{d.title}</span>
                    <span className={`block truncate text-fine ${u === "soon" ? "text-muted" : "font-semibold text-danger"}`}>
                      {u === "overdue" ? t.reminders.overdue : t.reminders.dueIn(formatRelative(due, now, locale))}
                      {courseName(d.courseId) && <span className="font-normal text-muted"> · {courseName(d.courseId)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </Section>
        )}

        {reminders.assessments.length > 0 && (
          <Section title={t.reminders.assessments}>
            {reminders.assessments.map((a) => (
              <li key={`${a.courseId}|${a.target.id}`} className="py-1.5">
                <Link href={`/targy/${a.courseId}`} onClick={() => setOpen(false)} className="block hover:underline">
                  <span className="block truncate text-small font-semibold text-foreground">
                    {courseName(a.courseId)} · {a.target.label}
                  </span>
                  <span className="block text-fine tabular-nums text-muted">
                    {a.instance.session && a.instance.at
                      ? `${shortDayLabel(new Date(a.instance.at), locale)} ${budapestTime(new Date(a.instance.at))}`
                      : instanceLabel(a.instance, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </Section>
        )}
      </Popover>
      {detail && <DeadlineDetailDialog deadline={detail} open onClose={() => setDetail(null)} />}
    </>
  );
}
