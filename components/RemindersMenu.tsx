"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildReminders } from "@/lib/reminders";
import { formatRelative, urgencyOf } from "@/lib/radar";
import { openCatchUp } from "@/lib/catchupEvents";
import { instanceLabel, instanceSnapshot, shortDayLabel } from "@/lib/rules/instances";
import { courseStanding } from "@/lib/rules/standing";
import { resultId } from "@/lib/rules/types";
import { budapestTime } from "@/lib/ical/budapest";
import { canAwait, RESULT_EXPECTED_DAYS, type CatchUpField, type CatchUpGroup } from "@/lib/catchup";
import { useCatchUpData } from "@/lib/useCatchUp";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import type { Deadline } from "@/lib/types";
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
        <h3 className="text-[13px] font-bold text-heading">{title}</h3>
        {action}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function groupText(group: CatchUpGroup, courseName: string | undefined): { title: string; sub: string } {
  const what = group.fields.map((f) => f.target.label.toLowerCase()).join(", ");
  if (group.deadline) return { title: group.deadline.title, sub: `${courseName ? `${courseName} · ` : ""}${what}` };
  return {
    title: courseName ?? group.session?.subject ?? group.fields[0].target.label,
    sub: `${instanceLabel(group.fields[0].instance)}: ${what}`,
  };
}

export function RemindersMenu() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Deadline | null>(null);
  const courses = useStore((s) => s.courses);
  const rules = useStore((s) => s.requirementRules);
  const results = useStore((s) => s.requirementResults);
  const setItems = useStore((s) => s.setRequirementResults);
  const { pending, awaiting, assessments, now } = useCatchUpData();
  const { visible } = useDedupedDeadlines();
  const risks = useMemo(
    () =>
      rules.flatMap((r) => {
        const own = results.filter((x) => x.courseId === r.courseId);
        const standing = own.some((x) => x.state === "recorded") ? courseStanding(r, own, now) : null;
        return standing?.risk ? [{ courseId: r.courseId, text: standing.risk, danger: standing.danger }] : [];
      }),
    [rules, results, now]
  );
  const reminders = useMemo(
    () => buildReminders({ pending, awaiting, deadlines: visible, assessments, risks, now }),
    [pending, awaiting, visible, assessments, risks, now]
  );
  const resultById = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);

  function save(f: CatchUpField, patch: ResultPatch) {
    setItems([
      {
        courseId: f.courseId,
        componentId: f.target.id,
        instanceKey: f.instance.key,
        patch: patch && { ...patch, ...instanceSnapshot(f.instance) },
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
      reminders.risks.length ===
    0;
  const urgent = reminders.awaiting.some((a) => a.overdue) || reminders.deadlines.some((d) => urgencyOf(d, now) === "overdue");
  const label = reminders.badge > 0 ? `Emlékeztetők (${reminders.badge})` : "Emlékeztetők";

  function fill(groupKey?: string) {
    setOpen(false);
    openCatchUp(groupKey ? { groupKey } : {});
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={close}
        label="Emlékeztetők"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={label}
            title={label}
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors duration-150 hover:bg-card/60 hover:text-heading md:h-8 md:w-8"
          >
            <Bell className="h-[18px] w-[18px]" />
            {reminders.badge > 0 && (
              <span
                aria-hidden="true"
                className={`absolute -right-0.5 -top-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums text-accent-ink ${
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
          <p className="font-display text-[20px] text-heading">Emlékeztetők</p>
        </div>
        {empty && <p className="px-4 pb-4 text-[14px] text-muted">Nincs teendőd.</p>}

        {reminders.pending.length > 0 && (
          <Section
            title="Rögzítésre vár"
            action={
              reminders.pending.length > 1 && (
                <button type="button" onClick={() => fill()} className="text-[12.5px] font-semibold text-heading underline underline-offset-2">
                  Mind kitöltése
                </button>
              )
            }
          >
            {reminders.pending.slice(0, 6).map((g) => {
              const text = groupText(g, courseName(g.courseId));
              const inline = g.fields.length <= INLINE_FIELDS;
              return (
                <li key={g.key} className="border-t border-border/60 py-2 first:border-t-0">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-foreground">{text.title}</span>
                      <span className="block truncate text-[12.5px] text-muted">{text.sub}</span>
                    </span>
                    {!inline && (
                      <button
                        type="button"
                        onClick={() => fill(g.key)}
                        className="h-8 shrink-0 rounded-[var(--radius)] border border-border bg-card px-2.5 text-[12.5px] font-semibold text-heading hover:border-border-strong"
                      >
                        Kitöltés
                      </button>
                    )}
                  </div>
                  {inline &&
                    g.fields.map((f) => {
                      const result = resultById.get(resultId(f.courseId, f.target.id, f.instance.key));
                      return (
                        <div key={f.target.id} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          {g.fields.length > 1 && <span className="w-full text-[12px] font-semibold text-muted">{f.target.label}</span>}
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
                              className="h-9 rounded-[var(--radius)] px-2 text-[12.5px] text-muted hover:bg-wash/[0.05] hover:text-heading"
                            >
                              Még nincs
                            </button>
                          )}
                        </div>
                      );
                    })}
                </li>
              );
            })}
            {reminders.pending.length > 6 && (
              <li className="py-1 text-[12.5px] text-muted">és még {reminders.pending.length - 6}</li>
            )}
          </Section>
        )}

        {reminders.risks.length > 0 && (
          <Section title="Figyelem">
            {reminders.risks.map((r) => (
              <li key={r.courseId} className="py-1.5">
                <Link href={`/targy/${r.courseId}`} onClick={() => setOpen(false)} className="block hover:underline">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">{courseName(r.courseId)}</span>
                  <span className={`block text-[12.5px] ${r.danger ? "font-semibold text-danger" : "text-warning"}`}>{r.text}</span>
                </Link>
              </li>
            ))}
          </Section>
        )}

        {reminders.awaiting.length > 0 && (
          <Section title="Eredményre vár">
            {reminders.awaiting.slice(0, 6).map((a) => {
              const since = a.result.at ? Date.parse(a.result.at) : NaN;
              const expected = Number.isFinite(since) ? shortDayLabel(new Date(since + RESULT_EXPECTED_DAYS * DAY_MS)) : null;
              return (
                <li key={a.result.id} className="py-1.5">
                  <Link href={`/targy/${a.courseId}`} onClick={() => setOpen(false)} className="block hover:underline">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      {courseName(a.courseId)} · {a.componentLabel}
                    </span>
                    <span className={`block text-[12.5px] ${a.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                      {a.overdue ? "Már meg kellett volna jönnie" : expected ? `Várható: ${expected}` : "Még nincs eredmény"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </Section>
        )}

        {reminders.deadlines.length > 0 && (
          <Section
            title="Közelgő határidők"
            action={
              <Link href="/radar" onClick={() => setOpen(false)} className="text-[12.5px] font-semibold text-heading underline underline-offset-2">
                Összes határidő
              </Link>
            }
          >
            {reminders.deadlines.map((d) => {
              const u = urgencyOf(d, now);
              const due = new Date(d.due);
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => setDetail(d)} className="block w-full py-1.5 text-left hover:underline">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">{d.title}</span>
                    <span className={`block truncate text-[12.5px] ${u === "soon" ? "text-muted" : "font-semibold text-danger"}`}>
                      {u === "overdue" ? "Lejárt" : `Lejár ${formatRelative(due, now)}`}
                      {courseName(d.courseId) && <span className="font-normal text-muted"> · {courseName(d.courseId)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </Section>
        )}

        {reminders.assessments.length > 0 && (
          <Section title="Közelgő számonkérések">
            {reminders.assessments.map((a) => (
              <li key={`${a.courseId}|${a.target.id}`} className="py-1.5">
                <Link href={`/targy/${a.courseId}`} onClick={() => setOpen(false)} className="block hover:underline">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {courseName(a.courseId)} · {a.target.label}
                  </span>
                  <span className="block text-[12.5px] tabular-nums text-muted">
                    {a.instance.session && a.instance.at
                      ? `${shortDayLabel(new Date(a.instance.at))} ${budapestTime(new Date(a.instance.at))}`
                      : instanceLabel(a.instance)}
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
