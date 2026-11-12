"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { MAX_ESTIMATE_MINUTES } from "@/lib/radar";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";

export interface EstimateFieldProps {
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  /** Hide the visible label (the detail dialog already has a row label). */
  hideLabel?: boolean;
}

/** Optional effort estimate: preset chips plus a free number of hours. Empty means none. */
export function EstimateField({ value, onChange, hideLabel = false }: EstimateFieldProps) {
  const t = useT();
  const presets = t.estimate.presets;
  const isPreset = value !== undefined && presets.some((p) => p.minutes === value);
  const [text, setText] = useState(() =>
    value !== undefined && !isPreset ? String(Math.round((value / 60) * 100) / 100) : ""
  );

  function handleText(next: string) {
    setText(next);
    const hours = Number(next.replace(",", "."));
    if (!next.trim() || !Number.isFinite(hours) || hours <= 0) {
      onChange(undefined);
      return;
    }
    onChange(Math.min(MAX_ESTIMATE_MINUTES, Math.max(1, Math.round(hours * 60))));
  }

  return (
    <div role="group" aria-label={t.estimate.label} className="flex flex-col gap-1.5">
      {!hideLabel && (
        <span className="text-small font-semibold text-heading">
          {t.estimate.label}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Pill
            key={p.minutes}
            active={value === p.minutes}
            onClick={() => {
              setText("");
              onChange(value === p.minutes ? undefined : p.minutes);
            }}
          >
            {p.label}
          </Pill>
        ))}
        <Input
          type="number"
          inputMode="decimal"
          min={0.5}
          max={MAX_ESTIMATE_MINUTES / 60}
          step={0.5}
          data-no-autofocus
          aria-label={t.estimate.freeHours}
          placeholder={t.estimate.freeHours}
          value={text}
          onChange={(e) => handleText(e.target.value)}
          className="!w-32"
        />
      </div>
    </div>
  );
}
