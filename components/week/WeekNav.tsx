"use client";

import { addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { buttonClasses } from "@/components/ui/Button";

export interface WeekNavProps {
  weekStart: Date;
  currentWeekStart: Date;
  onChange: (weekStart: Date) => void;
}

/** Previous / this week / next. "This week" is disabled while the current week is shown. */
export function WeekNav({ weekStart, currentWeekStart, onChange }: WeekNavProps) {
  const t = useT();
  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();
  const iconButton = buttonClasses({ variant: "secondary", size: "sm", className: "!px-2" });
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t.week.pickWeek}>
      <button
        type="button"
        aria-label={t.week.previous}
        onClick={() => onChange(addDays(weekStart, -7))}
        className={iconButton}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={isCurrent}
        onClick={() => onChange(currentWeekStart)}
        className={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        {t.week.thisWeek}
      </button>
      <button
        type="button"
        aria-label={t.week.nextWeek}
        onClick={() => onChange(addDays(weekStart, 7))}
        className={iconButton}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
