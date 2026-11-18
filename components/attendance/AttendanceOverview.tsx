"use client";
import Link from "next/link";
import { useAttendance } from "@/lib/useAttendance";
import { attendanceSummary } from "@/lib/attendance";
import { useT } from "@/lib/i18n/I18nProvider";

export function AttendanceOverview({ courseId, now }: { courseId: string; now: Date }) {
  const groups = useAttendance(courseId);
  const t = useT().attendance;
  return <Link href={`/targy/${courseId}#course-attendance`} aria-label={t.open} className="mt-3 block border-t border-border/70 pt-2 text-small hover:underline">
    <span className="font-semibold text-heading">{t.title}</span>
    {groups.map((g) => {
      const s = attendanceSummary(g, now);
      return <span key={g.target.id} className="mt-1 block tabular-nums">
        {groups.length > 1 && <span className="block truncate text-fine text-muted">{g.target.label}</span>}
        <span className={`font-semibold ${s.tone === "danger" ? "text-danger" : s.tone === "warning" ? "text-warning" : "text-heading"}`}>{t.absences(s.absences, s.limit)}</span>
        {s.remaining !== undefined && <span className="block text-fine text-muted">{t.remaining(s.remaining)}</span>}
        {s.unrecorded > 0 && <span className="block text-fine text-muted">{t.missing(s.unrecorded)}</span>}
      </span>;
    })}
  </Link>;
}
