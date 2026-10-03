"use client";

import { addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

export interface WeekNavProps {
  weekStart: Date;
  currentWeekStart: Date;
  onChange: (weekStart: Date) => void;
}

/** Previous / this week / next. "Ez a hét" is disabled while the current week is shown. */
export function WeekNav({ weekStart, currentWeekStart, onChange }: WeekNavProps) {
  const isCurrent = weekStart.getTime() === currentWeekStart.getTime();
  const iconButton = buttonClasses({ variant: "secondary", size: "sm", className: "!px-2" });
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Hét választása">
      <button
        type="button"
        aria-label="Előző hét"
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
        Ez a hét
      </button>
      <button
        type="button"
        aria-label="Következő hét"
        onClick={() => onChange(addDays(weekStart, 7))}
        className={iconButton}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
