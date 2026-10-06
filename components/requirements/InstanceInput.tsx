"use client";

import type { ReactNode } from "react";
import type { LinkTarget } from "@/lib/rules/links";
import type { RequirementResult, ResultValue, Scale } from "@/lib/rules/types";
import { fieldClasses } from "@/components/ui/Input";
import { NumberCell, PartsInput, QuizCell, ScaleInput } from "@/components/requirements/ResultInputs";

// The input for one instance of a component (a class, a week, a deadline), shared by the course
// page's instance list and the catch-up popup. One-tap choices are buttons with aria-pressed;
// pressing the active one clears it.

export type ResultPatch =
  | (Pick<RequirementResult, "state"> & Partial<Pick<RequirementResult, "value" | "retakeOf">>)
  | null;

function Choice({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: ReactNode; tone?: "danger" }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-[var(--radius)] border px-3 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
        active
          ? tone === "danger"
            ? "border-danger bg-danger/10 text-danger"
            : "border-accent bg-accent text-accent-ink"
          : "border-border bg-card text-foreground hover:border-border-strong"
      }`}
    >
      {children}
    </button>
  );
}

const ATTENDANCE: { status: "present" | "excused" | "unexcused"; label: string }[] = [
  { status: "present", label: "Ott voltam" },
  { status: "excused", label: "Igazoltan hiányoztam" },
  { status: "unexcused", label: "Igazolatlanul" },
];

export function InstanceInput({
  target,
  scale,
  result,
  label,
  onChange,
  labelOf = (id) => id,
}: {
  target: LinkTarget;
  /** Names of the exams a "choose" retake can replace. */
  labelOf?: (componentId: string) => string;
  /** A retake slot's scale (inherited from its first target exam). */
  scale?: Scale;
  result: RequirementResult | undefined;
  label: string;
  onChange: (patch: ResultPatch) => void;
}) {
  const recorded = (value: ResultValue | null) => onChange(value ? { state: "recorded", value } : null);
  const value = result?.state === "recorded" ? result.value : undefined;

  switch (target.kind) {
    case "attendance": {
      const status = value?.kind === "attendance" ? value.status : undefined;
      return (
        <span role="group" aria-label={label} className="flex flex-wrap gap-1.5">
          {ATTENDANCE.map((a) => (
            <Choice
              key={a.status}
              active={status === a.status}
              tone={a.status === "unexcused" ? "danger" : undefined}
              onClick={() => recorded(status === a.status ? null : { kind: "attendance", status: a.status })}
            >
              {a.label}
            </Choice>
          ))}
        </span>
      );
    }
    case "series": {
      const scoring = target.scoring;
      if (scoring.kind === "plusMinus") {
        const sign = value?.kind === "pm" ? value.sign : undefined;
        const na = result?.state === "na";
        return (
          <span role="group" aria-label={label} className="flex flex-wrap gap-1.5">
            <Choice active={sign === "+"} onClick={() => recorded(sign === "+" ? null : { kind: "pm", sign: "+" })}>
              <span aria-hidden>+</span>
              <span className="sr-only">Plusz</span>
            </Choice>
            <Choice active={sign === "-"} tone="danger" onClick={() => recorded(sign === "-" ? null : { kind: "pm", sign: "-" })}>
              <span aria-hidden>−</span>
              <span className="sr-only">Mínusz</span>
            </Choice>
            <Choice active={na} onClick={() => onChange(na ? null : { state: "na" })}>
              Nem írtunk
            </Choice>
          </span>
        );
      }
      if (scoring.kind === "percent") return <QuizCell result={result} label={label} onChange={recorded} />;
      if (scoring.parts?.length) return <PartsInput parts={scoring.parts} result={result} label={label} onChange={recorded} />;
      return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <NumberCell
            value={value?.kind === "points" ? value.points : undefined}
            max={scoring.max}
            label={label}
            onCommit={(n) => recorded(n === null ? null : { kind: "points", points: n })}
          />
          / {String(scoring.max).replace(".", ",")}
        </span>
      );
    }
    case "exam":
      return <ScaleInput scale={target.scale} result={result} label={label} onChange={recorded} />;
    case "retake": {
      if (!scale) return null;
      if (target.pick !== "choose") return <ScaleInput scale={scale} result={result} label={label} onChange={recorded} />;
      const retakeOf = result?.retakeOf ?? target.targets[0];
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <select
            aria-label={`${label}: melyiket váltja ki`}
            value={retakeOf}
            onChange={(e) => value && onChange({ state: "recorded", value, retakeOf: e.target.value })}
            className={`${fieldClasses} !w-auto !py-1.5`}
          >
            {target.targets.map((id) => (
              <option key={id} value={id}>
                {labelOf(id)}
              </option>
            ))}
          </select>
          <ScaleInput
            scale={scale}
            result={result}
            label={label}
            onChange={(v) => onChange(v ? { state: "recorded", value: v, retakeOf } : null)}
          />
        </span>
      );
    }
    case "assignment": {
      const outcome = value?.kind === "assignment" ? value.outcome : "";
      return (
        <select
          aria-label={label}
          value={outcome}
          onChange={(e) => recorded(e.target.value ? { kind: "assignment", outcome: e.target.value } : null)}
          className={`${fieldClasses} !w-auto max-w-full !py-1.5`}
        >
          <option value="">–</option>
          {target.outcomes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    default:
      return null;
  }
}
