"use client";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { Switch } from "@/components/ui/Switch";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function AttendanceSettings() {
  const t = useT().attendance;
  const enabled = useStore((s) => s.attendancePrefs?.enabled ?? true);
  const set = useStore((s) => s.setAttendancePrefs);
  return <section id="jelenlet" className="flex flex-col gap-5">
    <SectionHeading title={t.title} sub={t.settingsHint} />
    <div className="sheet-paper px-5 py-1"><Switch checked={enabled} onChange={set} label={t.reminders} description={t.remindersHint} /></div>
  </section>;
}
