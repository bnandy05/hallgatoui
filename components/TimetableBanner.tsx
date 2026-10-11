"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { unmappedSubjects } from "@/lib/ical/neptun";
import { buttonClasses } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";

/** Nudge to map timetable subjects that have no course yet (classes show with a neutral dot until then). */
export function TimetableBanner() {
  const t = useT();
  const sessions = useStore((s) => s.classSessions);
  const sources = useStore((s) => s.timetableSources);
  const [dismissed, setDismissed] = useState(false);

  const count = useMemo(() => unmappedSubjects(sessions, sources).length, [sessions, sources]);
  if (count === 0 || dismissed) return null;

  return (
    <div className="slip flex flex-wrap items-center gap-3 bg-canary py-3 pl-9 pr-4">
      <span aria-hidden="true" className="pin left-3.5 top-1/2 -mt-[5.5px]" />
      <CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-body font-semibold text-heading">
        {t.banners.unmappedSubjects(count)}
      </p>
      <div className="flex items-center gap-2">
        <Link href="/beallitasok#naptarak" className={buttonClasses({ size: "sm" })}>
          {t.banners.assign}
        </Link>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          {t.common.later}
        </Button>
      </div>
    </div>
  );
}
