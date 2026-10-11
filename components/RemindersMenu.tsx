"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useStore } from "@/lib/store";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { buildReminders } from "@/lib/reminders";
import { formatRelative, urgencyOf } from "@/lib/radar";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import type { Deadline } from "@/lib/types";
import { Popover } from "@/components/ui/Popover";
import { DeadlineDetailDialog } from "@/components/DeadlineItem";

// The header's bell: overdue and soon-due deadlines. Everything is derived from the store on
// every render; nothing is stored.

const TICK_MS = 60 * 1000;

function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function RemindersMenu() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Deadline | null>(null);
  const courses = useStore((s) => s.courses);
  const now = useMinuteNow();
  const { visible } = useDedupedDeadlines();
  const reminders = useMemo(() => buildReminders({ deadlines: visible, now }), [visible, now]);
  const courseName = (id: string | null) => (id ? courses.find((c) => c.id === id)?.name : undefined);
  const close = useCallback((next: boolean) => setOpen(next), []);
  const urgent = reminders.deadlines.some((d) => urgencyOf(d, now) === "overdue");
  const label = reminders.badge > 0 ? t.reminders.titleWithCount(reminders.badge) : t.reminders.title;

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
        <div className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3">
          <p className="font-display text-[20px] text-heading">{t.reminders.title}</p>
          {reminders.deadlines.length > 0 && (
            <Link href="/radar" onClick={() => setOpen(false)} className="text-[12.5px] font-semibold text-heading underline underline-offset-2">
              {t.reminders.allDeadlines}
            </Link>
          )}
        </div>
        {reminders.deadlines.length === 0 ? (
          <p className="px-4 pb-4 text-[14px] text-muted">{t.reminders.none}</p>
        ) : (
          <section className="border-t border-border px-4 py-3">
            <h3 className="mb-1.5 text-[13px] font-bold text-heading">{t.reminders.upcoming}</h3>
            <ul className="flex flex-col">
              {reminders.deadlines.map((d) => {
                const u = urgencyOf(d, now);
                return (
                  <li key={d.id}>
                    <button type="button" onClick={() => setDetail(d)} className="block w-full py-1.5 text-left hover:underline">
                      <span className="block truncate text-[13.5px] font-semibold text-foreground">{d.title}</span>
                      <span className={`block truncate text-[12.5px] ${u === "soon" ? "text-muted" : "font-semibold text-danger"}`}>
                        {u === "overdue" ? t.reminders.overdue : t.reminders.dueIn(formatRelative(new Date(d.due), now, dateLocale(locale)))}
                        {courseName(d.courseId) && <span className="font-normal text-muted"> · {courseName(d.courseId)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </Popover>
      {detail && <DeadlineDetailDialog deadline={detail} open onClose={() => setDetail(null)} />}
    </>
  );
}
