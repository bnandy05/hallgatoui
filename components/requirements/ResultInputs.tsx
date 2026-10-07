"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import type {
  AssignmentComponent,
  AttendanceComponent,
  BonusComponent,
  ExamComponent,
  Part,
  RequirementResult,
  RetakeSlot,
  ResultValue,
  Scale,
  SeriesComponent,
} from "@/lib/rules/types";
import { instanceOrder } from "@/lib/rules/types";
import { fieldClasses } from "@/components/ui/Input";

// Inputs for recording results, one editor per component kind. Every value is saved on blur or
// Enter (not per keystroke), so a sync is one change per entered value.

type SetResult = (
  componentId: string,
  instanceKey: string,
  patch: Pick<RequirementResult, "state"> & Partial<Pick<RequirementResult, "value" | "retakeOf">> | null
) => void;

export function useResultSetter(courseId: string): SetResult {
  const setRequirementResult = useStore((s) => s.setRequirementResult);
  return (componentId, instanceKey, patch) => setRequirementResult(courseId, componentId, instanceKey, patch);
}

const SINGLE = "n:1";

/** "12,5" or "12.5" → 12.5; empty → null; anything else → undefined (rejected). */
function parseNumber(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export const formatNumber = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","));

/** A small number field that commits on blur or Enter and refuses values outside 0..max. */
export function NumberCell({
  value,
  max,
  label,
  onCommit,
  className = "",
}: {
  value: number | undefined;
  max: number;
  label: string;
  onCommit: (value: number | null) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value);
  const parsed = draft === null ? value ?? null : parseNumber(draft);
  const invalid = parsed === undefined || (parsed !== null && (parsed < 0 || parsed > max));

  function commit() {
    if (draft === null) return;
    if (!invalid && parsed !== (value ?? null)) onCommit(parsed ?? null);
    setDraft(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
    if (event.key === "Escape") setDraft(null);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={invalid ? `0 és ${formatNumber(max)} között` : undefined}
      value={shown}
      placeholder="–"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={`${fieldClasses} !w-[4.5rem] !px-2 !py-1.5 text-center tabular-nums ${invalid ? "!border-danger" : ""} ${className}`}
    />
  );
}

function pointsOf(result: RequirementResult | undefined): number | undefined {
  return result?.value?.kind === "points" ? result.value.points : undefined;
}

/** Points (optionally split into parts) or a 1–5 grade on a scale. */
export function ScaleInput({
  scale,
  result,
  label,
  onChange,
}: {
  scale: Scale;
  result: RequirementResult | undefined;
  label: string;
  onChange: (value: ResultValue | null) => void;
}) {
  if (scale.kind === "grade") {
    const grade = result?.value?.kind === "grade" ? result.value.grade : "";
    return (
      <select
        aria-label={label}
        value={grade}
        onChange={(e) => onChange(e.target.value ? { kind: "grade", grade: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 } : null)}
        className={`${fieldClasses} !w-[5.5rem] !py-1.5`}
      >
        <option value="">–</option>
        {[5, 4, 3, 2, 1].map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    );
  }
  if (scale.parts?.length) return <PartsInput parts={scale.parts} result={result} label={label} onChange={onChange} />;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-muted">
      <NumberCell
        value={pointsOf(result)}
        max={scale.max}
        label={label}
        onCommit={(n) => onChange(n === null ? null : { kind: "points", points: n })}
      />
      / {formatNumber(scale.max)}
    </span>
  );
}

/** One cell per part; the total is their sum, saved once every part has a value. */
export function PartsInput({
  parts,
  result,
  label,
  onChange,
  stacked = false,
}: {
  parts: Part[];
  result: RequirementResult | undefined;
  label: string;
  onChange: (value: ResultValue | null) => void;
  /** One part under the other with its name above it (a series cell); otherwise side by side with its maximum. */
  stacked?: boolean;
}) {
  const saved = result?.value?.kind === "points" ? (result.value.parts ?? {}) : {};
  const [pending, setPending] = useState<Record<string, number>>({});
  const current = { ...saved, ...pending };

  function commitPart(partId: string, n: number | null) {
    const next = { ...current };
    if (n === null) delete next[partId];
    else next[partId] = n;
    if (parts.every((p) => next[p.id] !== undefined)) {
      setPending({});
      onChange({ kind: "points", points: parts.reduce((sum, p) => sum + next[p.id], 0), parts: next });
    } else {
      setPending(next);
      if (result) onChange(null); // an incomplete entry is not a result yet
    }
  }

  if (stacked) {
    return (
      <span className="flex w-full flex-col gap-1">
        {parts.map((p) => (
          <label key={p.id} className="flex flex-col items-center text-[12px] leading-tight text-muted">
            <span className="max-w-full truncate" title={`${p.label} (max. ${formatNumber(p.max)})`}>
              {p.label}
            </span>
            <NumberCell
              value={current[p.id]}
              max={p.max}
              label={`${label}, ${p.label}`}
              className="!w-full max-w-[4.5rem]"
              onCommit={(n) => commitPart(p.id, n)}
            />
          </label>
        ))}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
      {parts.map((p) => (
        <label key={p.id} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
          {p.label}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <NumberCell value={current[p.id]} max={p.max} label={`${label}, ${p.label}`} className="!w-14" onCommit={(n) => commitPart(p.id, n)} />/ {formatNumber(p.max)}
          </span>
        </label>
      ))}
    </span>
  );
}

export function scaleHint(scale: Scale): string {
  if (scale.kind === "grade") return `jegy, legalább ${scale.passAt ?? 2}-es`;
  const pass = scale.passAt !== undefined ? ` · min. ${formatNumber(scale.passAt)}` : "";
  return `max. ${formatNumber(scale.max)} pont${pass}`;
}

export function ExamInput({
  component,
  results,
  set,
}: {
  component: ExamComponent;
  results: RequirementResult[];
  set: SetResult;
}) {
  const result = results.find((r) => r.instanceKey === SINGLE);
  return (
    <ScaleInput
      scale={component.scale}
      result={result}
      label={component.label}
      onChange={(value) => set(component.id, SINGLE, value ? { state: "recorded", value } : null)}
    />
  );
}

export function RetakeInput({
  slot,
  scale,
  targets,
  results,
  set,
}: {
  slot: RetakeSlot;
  scale: Scale;
  targets: { id: string; label: string }[];
  results: RequirementResult[];
  set: SetResult;
}) {
  const result = results.find((r) => r.instanceKey === SINGLE);
  const [retakeOf, setRetakeOf] = useState(result?.retakeOf ?? targets[0]?.id ?? "");
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {slot.pick === "choose" && (
        <select
          aria-label={`${slot.label}: melyiket váltja ki`}
          value={retakeOf}
          onChange={(e) => {
            setRetakeOf(e.target.value);
            if (result?.value) set(slot.id, SINGLE, { state: "recorded", value: result.value, retakeOf: e.target.value });
          }}
          className={`${fieldClasses} !w-auto max-w-[16rem] !py-1.5`}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <ScaleInput
        scale={scale}
        result={result}
        label={slot.label}
        onChange={(value) =>
          set(slot.id, SINGLE, value ? { state: "recorded", value, ...(slot.pick === "choose" && { retakeOf }) } : null)
        }
      />
    </span>
  );
}

export function AssignmentInput({
  component,
  results,
  set,
}: {
  component: AssignmentComponent;
  results: RequirementResult[];
  set: SetResult;
}) {
  const result = results.find((r) => r.instanceKey === SINGLE);
  const outcome = result?.value?.kind === "assignment" ? result.value.outcome : "";
  return (
    <select
      aria-label={component.label}
      value={outcome}
      onChange={(e) =>
        set(component.id, SINGLE, e.target.value ? { state: "recorded", value: { kind: "assignment", outcome: e.target.value } } : null)
      }
      className={`${fieldClasses} !w-auto max-w-[15rem] !py-1.5`}
    >
      <option value="">Még nincs</option>
      {component.outcomes.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label} ({formatNumber(o.points)} p)
        </option>
      ))}
    </select>
  );
}

/** What a series has collected so far, in its own unit. */
export function seriesSummary(component: SeriesComponent, results: RequirementResult[]): string {
  const scoring = component.scoring;
  const recorded = results.filter((r) => r.state === "recorded");
  if (scoring.kind === "points") {
    const total = recorded.reduce((sum, r) => sum + (pointsOf(r) ?? 0), 0);
    return `${formatNumber(total)} / ${formatNumber(scoring.max * component.count)} pont`;
  }
  if (scoring.kind === "plusMinus") {
    const plus = recorded.filter((r) => r.value?.kind === "pm" && r.value.sign === "+").length;
    const minus = recorded.filter((r) => r.value?.kind === "pm" && r.value.sign === "-").length;
    return `${plus} plusz, ${minus} mínusz`;
  }
  const passed = recorded.filter(
    (r) => r.value?.kind === "quiz" && r.value.bestPercent >= scoring.passAt && (r.value.onTime || !scoring.onTimeOnly)
  ).length;
  return `${passed} / ${component.count} sikeres`;
}

/** Röpzh / quiz items: one cell per item, in instance order. */
export function SeriesInput({
  component,
  results,
  set,
}: {
  component: SeriesComponent;
  results: RequirementResult[];
  set: SetResult;
}) {
  const byKey = new Map(results.map((r) => [r.instanceKey, r]));
  const items = Array.from({ length: component.count }, (_, i) => `n:${i + 1}`);
  const scoring = component.scoring;
  const wide = scoring.kind === "percent" || (scoring.kind === "points" && !!scoring.parts?.length);
  return (
    <ol
      className={`grid gap-1.5 ${
        wide ? "grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))]"
      }`}
    >
      {items.map((key, i) => {
        const r = byKey.get(key);
        const label = `${component.label} ${i + 1}.`;
        return (
          <li key={key} className="flex flex-col items-center gap-1 rounded-[var(--radius)] bg-strip px-1 pb-1.5 pt-1">
            <span className="text-[11.5px] font-semibold tabular-nums text-muted-dim">{i + 1}.</span>
            {scoring.kind === "points" &&
              (scoring.parts?.length ? (
                <PartsInput
                  parts={scoring.parts}
                  result={r}
                  label={label}
                  stacked
                  onChange={(value) => set(component.id, key, value ? { state: "recorded", value } : null)}
                />
              ) : (
                <NumberCell
                  value={pointsOf(r)}
                  max={scoring.max}
                  label={label}
                  className="!w-full max-w-[4.5rem]"
                  onCommit={(n) => set(component.id, key, n === null ? null : { state: "recorded", value: { kind: "points", points: n } })}
                />
              ))}
            {scoring.kind === "plusMinus" && <PlusMinusCell result={r} label={label} onChange={(p) => set(component.id, key, p)} />}
            {scoring.kind === "percent" && (
              <QuizCell
                result={r}
                label={label}
                onChange={(value) => set(component.id, key, value ? { state: "recorded", value } : null)}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Cycles empty → + → − → elmaradt → empty. */
function PlusMinusCell({
  result,
  label,
  onChange,
}: {
  result: RequirementResult | undefined;
  label: string;
  onChange: (patch: Parameters<SetResult>[2]) => void;
}) {
  const state = result?.state === "na" ? "na" : result?.value?.kind === "pm" ? result.value.sign : "";
  const text = state === "na" ? "–" : state === "" ? "·" : state === "-" ? "−" : "+";
  const title = state === "na" ? "Elmaradt / nem volt" : state === "" ? "Még nincs" : state === "+" ? "Plusz" : "Mínusz";
  function next() {
    if (state === "") onChange({ state: "recorded", value: { kind: "pm", sign: "+" } });
    else if (state === "+") onChange({ state: "recorded", value: { kind: "pm", sign: "-" } });
    else if (state === "-") onChange({ state: "na" });
    else onChange(null);
  }
  return (
    <button
      type="button"
      onClick={next}
      aria-label={`${label}: ${title}`}
      title={`${title} (kattints a váltáshoz)`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border text-[17px] font-bold focus-visible:outline-2 focus-visible:outline-accent ${
        state === "+"
          ? "border-accent bg-accent text-accent-ink"
          : state === "-"
            ? "border-danger bg-danger/10 text-danger"
            : "border-border bg-card text-muted-dim"
      }`}
    >
      {text}
    </button>
  );
}

export function QuizCell({
  result,
  label,
  onChange,
}: {
  result: RequirementResult | undefined;
  label: string;
  onChange: (value: ResultValue | null) => void;
}) {
  const value = result?.value?.kind === "quiz" ? result.value : undefined;
  return (
    <span className="flex flex-col items-center gap-1">
      <NumberCell
        value={value?.bestPercent}
        max={100}
        label={`${label}, legjobb eredmény (%)`}
        onCommit={(n) => onChange(n === null ? null : { kind: "quiz", bestPercent: n, onTime: value?.onTime ?? true })}
      />
      <label className="inline-flex items-center gap-1 text-[11.5px] text-muted">
        <input
          type="checkbox"
          checked={value?.onTime ?? true}
          disabled={!value}
          onChange={(e) => value && onChange({ ...value, onTime: e.target.checked })}
        />
        időben
      </label>
    </span>
  );
}

function nextKey(results: RequirementResult[]): string {
  const max = results.reduce((m, r) => {
    const n = /^n:(\d+)$/.exec(r.instanceKey);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `n:${max + 1}`;
}

/** Counted absences against the limit, and whether the limit is crossed. */
export function attendanceSummary(component: AttendanceComponent, results: RequirementResult[]): { text: string; over: boolean } {
  const counted = results.filter(
    (r) =>
      r.value?.kind === "attendance" &&
      r.value.status !== "present" &&
      (r.value.status === "unexcused" || component.limit?.countExcused !== false)
  ).length;
  const limit = component.limit?.maxAbsences;
  return {
    text: limit !== undefined ? `${counted} / ${limit} hiányzás` : `${counted} hiányzás`,
    over: limit !== undefined && counted > limit,
  };
}

/** Absences only: unrecorded sessions count as attended. */
export function AttendanceInput({
  component,
  results,
  set,
}: {
  component: AttendanceComponent;
  results: RequirementResult[];
  set: SetResult;
}) {
  const absences = results
    .filter((r) => r.value?.kind === "attendance" && r.value.status !== "present")
    .sort(instanceOrder);
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {absences.map((r, i) => (
        <li key={r.id} className="inline-flex h-9 items-center gap-0.5 rounded-[var(--radius)] bg-strip pl-2.5 pr-0.5 text-[13px]">
          <span className="tabular-nums text-muted-dim">{i + 1}.</span>
          <select
            aria-label={`${i + 1}. hiányzás`}
            value={r.value?.kind === "attendance" ? r.value.status : "unexcused"}
            onChange={(e) =>
              set(component.id, r.instanceKey, {
                state: "recorded",
                value: { kind: "attendance", status: e.target.value as "excused" | "unexcused" },
              })
            }
            className="rounded-[var(--radius)] bg-transparent px-1 py-0.5 text-[13px] text-foreground"
          >
            <option value="unexcused">igazolatlan</option>
            <option value="excused">igazolt</option>
          </select>
          <button
            type="button"
            aria-label={`${i + 1}. hiányzás törlése`}
            onClick={() => set(component.id, r.instanceKey, null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
      <li>
        <AddSlot onClick={() => set(component.id, nextKey(results), { state: "recorded", value: { kind: "attendance", status: "unexcused" } })}>
          Hiányzás
        </AddSlot>
      </li>
    </ul>
  );
}

/** The bonus counted so far (capped). */
export function bonusSummary(component: BonusComponent, results: RequirementResult[]): string {
  const total = results.reduce((sum, r) => sum + (r.value?.kind === "bonus" ? r.value.points : 0), 0);
  const counted = component.cap !== undefined ? Math.min(total, component.cap) : total;
  return `${formatNumber(counted)}${component.cap !== undefined ? ` / ${formatNumber(component.cap)}` : ""} pont`;
}

export function BonusInput({
  component,
  results,
  set,
}: {
  component: BonusComponent;
  results: RequirementResult[];
  set: SetResult;
}) {
  const entries = results.filter((r) => r.value?.kind === "bonus").sort(instanceOrder);
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {entries.map((r, i) => (
        <li key={r.id} className="inline-flex h-9 items-center gap-0.5 rounded-[var(--radius)] bg-strip pl-1 pr-0.5">
          <NumberCell
            value={r.value?.kind === "bonus" ? r.value.points : undefined}
            max={1000}
            label={`${i + 1}. bónusz`}
            className="!w-14 !py-1"
            onCommit={(n) =>
              set(component.id, r.instanceKey, n === null ? null : { state: "recorded", value: { kind: "bonus", points: n } })
            }
          />
          <button
            type="button"
            aria-label={`${i + 1}. bónusz törlése`}
            onClick={() => set(component.id, r.instanceKey, null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
      <li>
        <AddSlot onClick={() => set(component.id, nextKey(results), { state: "recorded", value: { kind: "bonus", points: 1 } })}>
          Bónuszpont
        </AddSlot>
      </li>
    </ul>
  );
}

/** A dashed slot that adds one more entry. */
function AddSlot({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1 rounded-[var(--radius)] border border-dashed border-border-strong px-2.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-accent hover:text-heading"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}
