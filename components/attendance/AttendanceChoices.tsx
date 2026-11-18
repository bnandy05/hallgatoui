"use client";
import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { RequirementResult } from "@/lib/rules/types";
import type { ResultPatch } from "@/components/requirements/InstanceInput";
import { showToast } from "@/components/ui/Toast";

export function AttendanceChoices({ result, onChange, label, compact = false, allowCancel = true }: {
  result?: RequirementResult; onChange: (patch: ResultPatch) => void; label: string; compact?: boolean; allowCancel?: boolean;
}) {
  const t = useT().attendance;
  const root = useRef<HTMLDivElement>(null);
  const [undo, setUndo] = useState<{ previous: ResultPatch } | null>(null);
  const status = result?.state === "na" ? "cancelled" : result?.value?.kind === "attendance" ? result.value.status : undefined;
  function save(patch: ResultPatch) {
    const previous = result ? { state: result.state, value: result.value, at: result.at, label: result.label } : null;
    onChange(patch);
    if (root.current?.closest("dialog[open]")) { setUndo({ previous }); return; }
    showToast({ message: patch ? t.saved : t.cleared, actionLabel: t.undo, onAction: () => onChange(previous) });
  }
  return (
    <div ref={root} role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {(["present", "unexcused"] as const).map((value) => {
        const active = status === value;
        const Icon = value === "present" ? Check : X;
        return <button key={value} type="button" aria-pressed={active}
          onClick={() => save({ state: "recorded", value: { kind: "attendance", status: value } })}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 text-small font-semibold transition-colors pointer-coarse:min-h-11 ${active ? "border-accent bg-accent text-accent-ink" : "border-border-strong bg-card text-heading hover:border-accent"}`}>
          {!compact && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
          {value === "present" ? t.present : t.absent}
        </button>;
      })}
      {undo && <button type="button" className="link-text min-h-8 text-small" onClick={() => { onChange(undo.previous); setUndo(null); }}>{t.undo}</button>}
      {compact && (status === "cancelled" || status === "excused") && <span className="text-fine text-muted">{status === "cancelled" ? t.cancelled : t.excused}</span>}
      {!compact && <details className="basis-full text-small">
        <summary className="w-fit cursor-pointer py-1 text-muted hover:text-heading">{status === "excused" ? t.excused : status === "cancelled" ? t.cancelled : t.more}</summary>
        <div className="flex flex-wrap gap-2 py-2">
          <button type="button" aria-pressed={status === "excused"} className="link-text min-h-8" onClick={() => save({ state: "recorded", value: { kind: "attendance", status: "excused" } })}>{t.excused}</button>
          {allowCancel && <button type="button" aria-pressed={status === "cancelled"} className="link-text min-h-8" onClick={() => save({ state: "na" })}>{t.cancelled}</button>}
          {result && <button type="button" className="link-text min-h-8" onClick={() => save(null)}>{t.clear}</button>}
        </div>
      </details>}
    </div>
  );
}
