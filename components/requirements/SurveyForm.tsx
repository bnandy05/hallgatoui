"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, Check, Code } from "lucide-react";
import {
  FIELD_META,
  SECTIONS,
  consistency,
  gateOpen,
  gatedValues,
  sectionOn,
  surveyRules,
  surveyValues,
  GATES,
  type FieldId,
  type FieldMeta,
  type FieldValue,
  type NumberValue,
  type SectionId,
  type SurveyDraft,
  type SurveyValues,
} from "@/lib/rules/extract/survey";
import type { SubjectRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { fieldClasses } from "@/components/ui/Input";
import { Switch, SwitchTrack } from "@/components/ui/Switch";
import { RulesErrors, RulesPreview } from "./RulesPreview";

// The survey reading's review screen: a form prefilled from Jev's answers, beside a live preview
// of the rules it makes. Sections follow the document's parts; a part's yes/no answer is the
// switch in its heading and collapses it. Every flagged field sits on canary paper with its
// reasons and the text the number was found in, and has to be confirmed (or edited, which
// confirms it) before saving; a form that cannot be written as rules cannot be saved.

const MAX_COUNT = 15;

const GRADE_FIELDS = [
  { id: "grade2_min_points", grade: 2, name: "elégséges" },
  { id: "grade3_min_points", grade: 3, name: "közepes" },
  { id: "grade4_min_points", grade: 4, name: "jó" },
  { id: "grade5_min_points", grade: 5, name: "jeles" },
] as const satisfies { id: FieldId; grade: number; name: string }[];
const GRADE_IDS = new Set<FieldId>(GRADE_FIELDS.map((g) => g.id));

/** The unit a number field counts in, when it isn't points. */
const UNIT: Partial<Record<FieldId, string>> = { max_absences: "alkalom" };

/** Sections whose yes/no answer is the heading's switch. */
const yesNoPresence = (presence: FieldId | undefined): presence is FieldId =>
  presence !== undefined && FIELD_META[presence].kind === "yesno";

export function SurveyForm({
  draft,
  truncated,
  notice,
  canShare,
  replacing,
  onSave,
  onBack,
  onManual,
}: {
  draft: SurveyDraft;
  truncated?: boolean;
  notice?: string;
  canShare: boolean;
  replacing: boolean;
  onSave: (rules: SubjectRules, share: boolean) => void;
  onBack: () => void;
  onManual: (rules?: SubjectRules) => void;
}) {
  const [values, setValues] = useState<SurveyValues>(() => surveyValues(draft));
  const [confirmed, setConfirmed] = useState<ReadonlySet<FieldId>>(new Set());
  const [share, setShare] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);

  const resolved = (id: FieldId) => !draft.fields[id].flagged || confirmed.has(id);
  /** A detail is hidden while its gate says the part does not exist and the gate itself is settled. */
  const hidden = (id: FieldId) => {
    const g = GATES[id];
    return g !== undefined && !gateOpen(id, values) && resolved(g.gate);
  };
  const live = useMemo(() => {
    const out = new Map<FieldId, string[]>();
    for (const [id, reason] of consistency(gatedValues(values))) out.set(id, [...(out.get(id) ?? []), reason]);
    return out;
  }, [values]);

  const set = (id: FieldId, value: FieldValue) => {
    setValues((v) => ({ ...v, [id]: value }));
    setConfirmed((c) => new Set(c).add(id));
  };
  const setMany = (patch: Partial<SurveyValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setConfirmed((c) => new Set([...c, ...(Object.keys(patch) as FieldId[])]));
  };
  const confirm = (ids: FieldId[]) => {
    // A yes/no field nobody answered becomes a plain no.
    setValues((v) => {
      const next = { ...v };
      for (const id of ids) if (FIELD_META[id].kind === "yesno" && v[id] === null) next[id] = false;
      return next;
    });
    setConfirmed((c) => new Set([...c, ...ids]));
  };

  const built = useMemo(() => surveyRules(values), [values]);
  const visible = (meta: FieldMeta) => {
    const section = SECTIONS.find((s) => s.id === meta.section)!;
    if (hidden(meta.id)) return false;
    if (section.presence && section.presence !== meta.id && !sectionOn(section.presence, values) && resolved(section.presence)) return false;
    return true;
  };
  const isPending = (id: FieldId) => visible(FIELD_META[id]) && draft.fields[id].flagged && !confirmed.has(id);
  const pending = Object.values(FIELD_META).filter((m) => isPending(m.id)).length;
  const canSave = pending === 0 && built.rules !== null;

  const reasonsOf = (id: FieldId) => {
    const own = draft.fields[id].reasons;
    return [...own, ...(live.get(id) ?? []).filter((r) => !own.includes(r))];
  };
  const fieldProps = (meta: FieldMeta) => ({
    meta,
    value: values[meta.id],
    original: draft.fields[meta.id].value,
    pending: isPending(meta.id),
    reviewed: draft.fields[meta.id].flagged && confirmed.has(meta.id),
    reasons: reasonsOf(meta.id),
    issues: live.get(meta.id) ?? [],
    quote: draft.fields[meta.id].quote,
    onChange: (v: FieldValue) => set(meta.id, v),
    onConfirm: () => confirm([meta.id]),
  });

  function jumpToNext() {
    const next = formRef.current?.querySelector<HTMLElement>("[data-survey-pending]");
    if (!next) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    next.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    next.querySelector<HTMLElement>("input:checked, input, select, button")?.focus({ preventScroll: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div ref={formRef} className="flex min-w-0 flex-col gap-5">
          <ReviewStatus pending={pending} notice={notice} truncated={truncated} onNext={jumpToNext} />

          {SECTIONS.map((section) => {
            const presence = yesNoPresence(section.presence) ? section.presence : undefined;
            const fields = Object.values(FIELD_META).filter((m) => m.section === section.id && m.id !== presence && visible(m));
            if (fields.length === 0 && !presence) return null;
            const off = presence !== undefined && !sectionOn(presence, values) && resolved(presence);
            const count = [...(presence ? [presence] : []), ...fields.map((f) => f.id)].filter(isPending).length;
            const grades = fields.filter((f) => GRADE_IDS.has(f.id));
            return (
              <SurveySection
                key={section.id}
                id={section.id}
                title={section.title}
                pending={count}
                presence={
                  presence && {
                    ...fieldProps(FIELD_META[presence]),
                    checked: values[presence] === true,
                  }
                }
              >
                {off ? (
                  <p className="text-[13.5px] text-muted">Nincs a félévben.</p>
                ) : (
                  <>
                    {fields
                      .filter((f) => !GRADE_IDS.has(f.id))
                      .map((meta) => (
                        <FieldRow key={meta.id} {...fieldProps(meta)} />
                      ))}
                    {grades.length > 0 && (
                      <GradeLimits
                        values={values}
                        fields={GRADE_FIELDS.filter((g) => grades.some((f) => f.id === g.id))}
                        isPending={isPending}
                        reasonsOf={reasonsOf}
                        issuesOf={(id) => live.get(id) ?? []}
                        quoteOf={(id) => draft.fields[id].quote}
                        onChange={setMany}
                        onConfirm={confirm}
                      />
                    )}
                  </>
                )}
              </SurveySection>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4 rounded-[var(--radius-slip)] bg-inset px-4 py-4 lg:sticky lg:top-[5.5rem] lg:max-h-[calc(var(--visual-height,100dvh)-14rem)] lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-[19px] text-heading">Ezt állítjuk be</h3>
              <p className="mt-1 text-[12.5px] text-muted">Az űrlap minden módosításával frissül.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2 -mt-1 shrink-0"
              title="A szabályok JSON-ban, az űrlap mostani állapotából"
              onClick={() => onManual(built.rules ?? undefined)}
            >
              <Code className="h-3.5 w-3.5" aria-hidden />
              JSON
            </Button>
          </div>
          {built.rules ? (
            <RulesPreview rules={built.rules} />
          ) : (
            <RulesErrors
              title="Ebből még nem áll össze szabály"
              errors={built.errors}
              hint="Javítsd az űrlapot, vagy add meg a szabályokat kézzel."
            />
          )}
          {canShare && built.rules && (
            <div className="border-t border-border">
              <Switch
                checked={share}
                onChange={setShare}
                label="Megosztom a sablont"
                description="Az egyetemed hallgatói, akik ugyanezt a tárgykódot veszik fel, átvehetik a szabályokat. Névtelenül, az eredményeid nélkül."
              />
            </div>
          )}
          {replacing && (
            <p className="text-[12.5px] text-muted">A mentés lecseréli a tárgy mostani szabályait, az eredményeid megmaradnak.</p>
          )}
        </aside>
      </div>

      <DialogActions>
        <p className="mr-auto self-center text-[13px] text-muted max-sm:!basis-full max-sm:text-center" aria-live="polite">
          {pending > 0
            ? `Még ${pending} mező vár átnézésre.`
            : built.rules
              ? "Minden átnézve, menthető."
              : "Az előnézet mutatja, mi hiányzik."}
        </p>
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Vissza
        </Button>
        <Button type="button" disabled={!canSave} onClick={() => built.rules && onSave(built.rules, canShare && share)}>
          Mentés
        </Button>
      </DialogActions>
    </div>
  );
}

function ReviewStatus({
  pending,
  notice,
  truncated,
  onNext,
}: {
  pending: number;
  notice?: string;
  truncated?: boolean;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <p className="text-[13.5px] text-foreground" role="status">
          {notice}
        </p>
      )}
      {truncated && (
        <p className="text-[13px] text-muted">A dokumentumnak csak az első 40 000 karakterét olvastuk el, a többit nézd át te.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-4">
        {pending > 0 ? (
          <p className="min-w-0 flex-1 text-[14px] text-foreground">
            <span className="mr-0.5 inline-block rounded-[3px] bg-canary px-1.5 font-semibold tabular-nums text-heading">{pending}</span>{" "}
            {notice
              ? "mezőt tölts ki a dokumentum alapján."
              : "mezőt nézz át: itt a Jev bizonytalan volt, vagy ellentmondást találtunk. A többit a dokumentumból töltöttük ki."}
          </p>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-foreground">
            <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
            Minden jelölt mezőt átnéztél. Vesd össze az előnézetet a dokumentummal.
          </p>
        )}
        {pending > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={onNext}>
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            Következő
          </Button>
        )}
      </div>
    </div>
  );
}

type FieldRowProps = {
  meta: FieldMeta;
  value: FieldValue;
  original: FieldValue;
  pending: boolean;
  reviewed: boolean;
  reasons: string[];
  /** What the consistency checks say about the current values. */
  issues: string[];
  quote?: string;
  onChange: (v: FieldValue) => void;
  onConfirm: () => void;
};

function SurveySection({
  id,
  title,
  pending,
  presence,
  children,
}: {
  id: SectionId;
  title: string;
  pending: number;
  presence?: FieldRowProps & { checked: boolean };
  children: ReactNode;
}) {
  const headingId = `survey-section-${id}`;
  const subId = `${headingId}-sub`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={headingId} className="font-display text-[22px] text-heading">
            {title}
          </h3>
          {presence && (
            <p id={subId} className="mt-1 text-[13px] text-muted">
              {presence.meta.label}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          {pending > 0 && (
            <span className="rounded-[3px] bg-canary px-1.5 py-px text-[11.5px] font-semibold tabular-nums text-heading">
              {pending} átnézendő
            </span>
          )}
          {presence && (
            <SwitchTrack
              checked={presence.checked}
              onChange={presence.onChange}
              aria-label={presence.meta.label}
              aria-describedby={subId}
            />
          )}
        </div>
      </div>
      {presence?.pending && (
        <div data-survey-pending className="mt-1.5 rounded-[var(--radius-slip)] bg-canary px-3 py-2.5">
          <FlagNote reasons={presence.reasons} onConfirm={presence.onConfirm} />
        </div>
      )}
      <div className="mt-1 flex flex-col gap-1">{children}</div>
    </section>
  );
}

function FieldRow({ meta, value, original, pending, reviewed, reasons, issues, quote, onChange, onConfirm }: FieldRowProps) {
  const id = `survey-${meta.id}`;
  const label = (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{meta.label}</span>
      {reviewed && !pending && (
        <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-success">
          <Check className="h-3 w-3" aria-hidden />
          átnézve
        </span>
      )}
    </span>
  );

  let control: ReactNode;
  if (meta.kind === "enum") {
    control = <ChoiceList id={id} meta={meta} value={typeof value === "string" ? value : null} original={original} onChange={onChange} />;
  } else if (meta.kind === "yesno") {
    control = <SwitchTrack id={id} checked={value === true} onChange={onChange} />;
  } else if (meta.kind === "count") {
    control = (
      <select
        id={id}
        className={`${fieldClasses} !w-24 tabular-nums`}
        value={typeof value === "number" ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">nincs</option>
        {Array.from({ length: MAX_COUNT }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
    );
  } else {
    control = <PointField id={id} value={typeof value === "object" ? value : null} unit={UNIT[meta.id] ?? "pont"} onChange={onChange} />;
  }

  return (
    <div
      data-field={meta.id}
      data-survey-pending={pending || undefined}
      className={pending ? "-mx-3 my-1 rounded-[var(--radius-slip)] bg-canary px-3 py-3" : "py-2"}
    >
      {meta.kind === "enum" ? (
        <fieldset>
          <legend className="mb-2 text-[14px] font-semibold text-heading">{label}</legend>
          {control}
        </fieldset>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <label htmlFor={id} className="min-w-0 flex-1 basis-56 cursor-pointer text-[14px] font-semibold text-heading">
            {label}
          </label>
          {control}
        </div>
      )}
      {pending && (
        <FlagNote
          reasons={reasons}
          quote={quote}
          onConfirm={meta.kind === "enum" && value === null ? undefined : onConfirm}
          className="mt-2.5"
        />
      )}
      {!pending && <Issues issues={issues} />}
    </div>
  );
}

/** Why a field needs a look, the text its number was found in, and "Rendben". */
function FlagNote({
  reasons,
  quote,
  onConfirm,
  className = "",
}: {
  reasons: string[];
  quote?: string;
  /** Without it the note asks for a choice instead (an enum nobody answered); `false` shows no action row. */
  onConfirm?: (() => void) | false;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {reasons.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[13px] leading-snug text-heading">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {quote && (
        <figure className="border-l border-heading/40 pl-2.5">
          <figcaption className="text-[12px] text-heading/75">A szám első előfordulása a szövegben:</figcaption>
          <blockquote className="line-clamp-3 text-[13px] italic text-heading">{quote}</blockquote>
        </figure>
      )}
      {onConfirm !== false && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {onConfirm && (
            <Button type="button" variant="secondary" size="sm" onClick={onConfirm}>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Rendben
            </Button>
          )}
          <span className="text-[12.5px] text-heading/75">{onConfirm ? "vagy írd át a mezőt" : "Válassz egy lehetőséget."}</span>
        </div>
      )}
    </div>
  );
}

/** An enum answer as a ruled list of every option, so the choices are visible without opening anything. */
function ChoiceList({
  id,
  meta,
  value,
  original,
  onChange,
}: {
  id: string;
  meta: FieldMeta;
  value: string | null;
  original: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      {meta.options!.map((o) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-2.5 border-t border-border px-3 py-2 text-[14px] transition-colors duration-150 first:border-t-0 ${
              checked ? "bg-wash/[0.05] text-heading" : "text-foreground hover:bg-wash/[0.03]"
            }`}
          >
            <input
              type="radio"
              name={id}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className={`min-w-0 flex-1 ${checked ? "font-medium" : ""}`}>{o.label}</span>
            {original === o.value && !checked && <span className="shrink-0 text-[12px] text-muted">a Jev válasza</span>}
          </label>
        );
      })}
    </div>
  );
}

const NUMBER_RE = /^\d+(\.\d+)?$/;
const parseNumber = (t: string): number | null => {
  const clean = t.trim().replace(",", ".");
  const n = NUMBER_RE.test(clean) ? Number(clean) : null;
  return n === null || n > 10000 ? null : n;
};
const formatNumber = (v: NumberValue | null) => (v ? String(v.value).replace(".", ",") : "");

/** A decimal field that keeps its own text, so "2," can be typed; empty means "nincs". */
function NumberInput({
  id,
  value,
  onChange,
  className = "",
  ...aria
}: {
  id?: string;
  value: NumberValue | null;
  onChange: (n: number | null) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => formatNumber(value));
  return (
    <input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder="nincs"
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
      className={`${fieldClasses} text-right tabular-nums ${className}`}
      {...aria}
    />
  );
}

/** Points (or another count) versus percent, as two pressed buttons. */
function UnitToggle({
  percent,
  unit,
  onChange,
  label,
}: {
  percent: boolean | null;
  unit: string;
  onChange: (percent: boolean) => void;
  label: string;
}) {
  const option = (p: boolean, text: string) => (
    <button
      type="button"
      aria-pressed={percent === p}
      onClick={() => onChange(p)}
      className={`inline-flex h-full min-w-10 items-center justify-center rounded-[3px] px-2.5 text-[13px] font-semibold transition-colors duration-150 ${
        percent === p ? "bg-accent text-accent-ink" : "text-muted hover:text-heading"
      }`}
    >
      {text}
    </button>
  );
  return (
    <span role="group" aria-label={label} className="inline-flex h-10 shrink-0 gap-0.5 rounded-[var(--radius)] border border-border bg-card p-[3px]">
      {option(false, unit)}
      {option(true, "%")}
    </span>
  );
}

function PointField({
  id,
  value,
  unit,
  onChange,
}: {
  id: string;
  value: NumberValue | null;
  unit: string;
  onChange: (v: NumberValue | null) => void;
}) {
  const [percent, setPercent] = useState(value?.percent ?? false);
  const [n, setN] = useState<number | null>(value?.value ?? null);
  const emit = (next: number | null, p: boolean) => onChange(next === null ? null : { value: next, percent: p });
  return (
    <span className="flex shrink-0 items-center gap-2">
      <NumberInput
        id={id}
        value={value}
        className="!w-24"
        onChange={(next) => {
          setN(next);
          emit(next, percent);
        }}
      />
      <UnitToggle
        percent={percent}
        unit={unit}
        label="Mértékegység"
        onChange={(p) => {
          setPercent(p);
          emit(n, p);
        }}
      />
    </span>
  );
}

/** The four grade limits side by side, sharing one unit; flagged cells sit on canary paper. */
function GradeLimits({
  values,
  fields,
  isPending,
  reasonsOf,
  issuesOf,
  quoteOf,
  onChange,
  onConfirm,
}: {
  values: SurveyValues;
  fields: (typeof GRADE_FIELDS)[number][];
  isPending: (id: FieldId) => boolean;
  reasonsOf: (id: FieldId) => string[];
  issuesOf: (id: FieldId) => string[];
  quoteOf: (id: FieldId) => string | undefined;
  onChange: (patch: Partial<SurveyValues>) => void;
  onConfirm: (ids: FieldId[]) => void;
}) {
  const numbers = fields.map((f) => values[f.id]).filter((v): v is NumberValue => typeof v === "object" && v !== null);
  const [unit, setUnit] = useState<boolean | null>(() =>
    numbers.length === 0 ? false : numbers.every((v) => v.percent) ? true : numbers.every((v) => !v.percent) ? false : null
  );
  const flagged = fields.filter((f) => isPending(f.id));
  const legendId = useId();

  function changeUnit(p: boolean) {
    setUnit(p);
    const patch: Partial<SurveyValues> = {};
    for (const f of fields) {
      const v = values[f.id];
      if (typeof v === "object" && v !== null && v.percent !== p) patch[f.id] = { ...v, percent: p };
    }
    if (Object.keys(patch).length > 0) onChange(patch);
  }

  return (
    <div role="group" aria-labelledby={legendId} className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p id={legendId} className="text-[14px] font-semibold text-heading">
          A jegyek alsó határa
        </p>
        <UnitToggle percent={unit} unit="pont" label="A ponthatárok mértékegysége" onChange={changeUnit} />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {fields.map((f) => {
          const pending = isPending(f.id);
          const v = values[f.id];
          const id = `survey-${f.id}`;
          return (
            <div
              key={f.id}
              data-survey-pending={pending || undefined}
              className={`flex flex-col gap-2 rounded-[var(--radius-slip)] px-3 pb-3 pt-2.5 ${pending ? "bg-canary" : "border border-border"}`}
            >
              <label htmlFor={id} className="flex cursor-pointer items-baseline gap-1.5">
                <span className="font-display text-[28px] tabular-nums text-heading">{f.grade}</span>
                <span className="text-[13px] text-muted">{f.name}</span>
              </label>
              <NumberInput
                id={id}
                value={typeof v === "object" ? v : null}
                onChange={(n) => onChange({ [f.id]: n === null ? null : { value: n, percent: unit ?? false } })}
              />
            </div>
          );
        })}
      </div>
      {flagged.length > 0 && (
        <div className="mt-2 rounded-[var(--radius-slip)] bg-canary px-3 py-2.5">
          <ul className="flex flex-col gap-2">
            {flagged.map((f) => (
              <li key={f.id}>
                <p className="text-[12.5px] font-semibold text-heading">
                  {f.grade} ({f.name})
                </p>
                <FlagNote reasons={reasonsOf(f.id)} quote={quoteOf(f.id)} onConfirm={false} className="mt-0.5" />
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" size="sm" className="mt-2.5" onClick={() => onConfirm(flagged.map((f) => f.id))}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            {flagged.length === 1 ? "Rendben" : "Mind rendben"}
          </Button>
        </div>
      )}
      <Issues issues={[...new Set(fields.flatMap((f) => (isPending(f.id) ? [] : issuesOf(f.id))))]} />
    </div>
  );
}

/** A contradiction in the current values, after the field was reviewed: shown, never fixed. */
function Issues({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-warning">
      {issues.map((r) => (
        <li key={r} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {r}
        </li>
      ))}
    </ul>
  );
}
