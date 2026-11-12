"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { useTimetableImport } from "@/components/settings/useTimetableImport";
import { CalendarImportForm } from "./CalendarImportForm";

export function FirstCalendar() {
  const t = useT();
  const timetable = useTimetableImport();
  return (
    <section aria-labelledby="first-calendar-heading" className="sheet-paper flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
      <div>
        <h2 id="first-calendar-heading" className="font-display text-headline text-heading">{t.home.linkCalendar}</h2>
        <p className="mt-1 text-body text-muted">{t.home.firstCalendarHint}</p>
      </div>
      <CalendarImportForm timetable={timetable} />
      {timetable.dialogs}
    </section>
  );
}
