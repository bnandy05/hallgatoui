"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { describeRules } from "@/lib/rules/describe";
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
  type SurveyDraft,
  type SurveyValues,
} from "@/lib/rules/extract/survey";
import type { SubjectRules } from "@/lib/rules/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";

// The survey reading's review screen: a form prefilled from Jev's answers. Every flagged field sits
// on canary paper with its reasons and the quote it was read from, and has to be confirmed (or
// edited, which confirms it) before saving; the rules shown below are rebuilt from the form on
// every change, and a form that cannot be written as rules cannot be saved.

const MAX_COUNT = 15;

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
  onManual: () => void;
}) {
  const [values, setValues] = useState<SurveyValues>(() => surveyValues(draft));
  const [confirmed, setConfirmed] = useState<ReadonlySet<FieldId>>(new Set());
  const [share, setShare] = useState(true);

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
  const confirm = (id: FieldId) => {
    // A yes/no field nobody answered becomes a plain no.
    if (FIELD_META[id].kind === "yesno" && values[id] === null) setValues((v) => ({ ...v, [id]: false }));
    setConfirmed((c) => new Set(c).add(id));
  };

  const built = useMemo(() => surveyRules(values), [values]);
  const visible = (meta: FieldMeta) => {
    const section = SECTIONS.find((s) => s.id === meta.section)!;
    if (hidden(meta.id)) return false;
    if (section.presence && section.presence !== meta.id && !sectionOn(section.presence, values) && resolved(section.presence)) return false;
    return true;
  };
  const pending = Object.values(FIELD_META).filter((m) => visible(m) && draft.fields[m.id].flagged && !confirmed.has(m.id)).length;
  const canSave = pending === 0 && built.rules !== null;

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p className="rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-[13.5px] text-foreground" role="status">
          {notice}
        </p>
      )}
      {truncated && (
        <p className="text-[13px] text-muted">A dokumentumnak csak az első 40 000 karakterét olvastuk el; a többit nézd át te.</p>
      )}
      {!notice && (
        <p className="text-[13px] text-muted">
          A Jev a dokumentum alapján előre kitöltötte az űrlapot. A sárga mezőket nézd meg, és erősítsd meg őket, mielőtt mentenél.
        </p>
      )}

      {SECTIONS.map((section) => {
        const fields = Object.values(FIELD_META).filter((m) => m.section === section.id && visible(m));
        if (fields.length === 0) return null;
        return (
          <section key={section.id} className="flex flex-col gap-2">
            <h3 className="text-[14px] font-semibold text-heading">{section.title}</h3>
            {fields.map((meta) => (
              <FieldRow
                key={meta.id}
                meta={meta}
                value={values[meta.id]}
                flagged={draft.fields[meta.id].flagged && !confirmed.has(meta.id)}
                reasons={[...draft.fields[meta.id].reasons, ...(live.get(meta.id) ?? []).filter((r) => !draft.fields[meta.id].reasons.includes(r))]}
                quote={draft.fields[meta.id].quote}
                onChange={(v) => set(meta.id, v)}
                onConfirm={() => confirm(meta.id)}
              />
            ))}
          </section>
        );
      })}

      <section className="flex flex-col gap-3 border-t border-border pt-4" aria-live="polite">
        {built.rules ? (
          <>
            <p className="text-[14px] font-semibold text-heading">Ezt állítjuk be</p>
            {describeRules(built.rules).map((s) => (
              <div key={s.title}>
                <p className="text-[13px] font-semibold text-foreground">{s.title}</p>
                <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-foreground">
                  {s.lines.map((l) => (
                    <li key={l} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {built.rules.flags.length > 0 && (
              <div>
                <p className="text-[13px] font-semibold text-foreground">Ellenőrizd</p>
                <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-foreground">
                  {built.rules.flags.map((f) => (
                    <li key={`${f.field}:${f.message}`} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3" role="alert">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-danger">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Ebből még nem áll össze érvényes szabály
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-foreground">
              {built.errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted">Javítsd az űrlapot, vagy add meg a szabályokat kézzel.</p>
          </div>
        )}
      </section>

      {canShare && built.rules && (
        <Switch
          checked={share}
          onChange={setShare}
          label="Megosztom a sablont"
          description="Az egyetemed hallgatói, akik ugyanezt a tárgykódot veszik fel, átvehetik ezeket a szabályokat. Névtelenül, az eredményeid nélkül."
        />
      )}
      {replacing && <p className="text-[12.5px] text-muted">A mentés lecseréli a tárgy mostani szabályait, az eredményeid megmaradnak.</p>}

      <DialogActions>
        {pending > 0 && <p className="mr-auto self-center text-[13px] text-muted">Még {pending} mező vár ellenőrzésre.</p>}
        <Button type="button" variant="secondary" onClick={onBack}>
          Vissza
        </Button>
        <Button type="button" variant="secondary" onClick={onManual}>
          Kézi beállítás
        </Button>
        <Button type="button" disabled={!canSave} onClick={() => built.rules && onSave(built.rules, canShare && share)}>
          Mentés
        </Button>
      </DialogActions>
    </div>
  );
}

function FieldRow({
  meta,
  value,
  flagged,
  reasons,
  quote,
  onChange,
  onConfirm,
}: {
  meta: FieldMeta;
  value: FieldValue;
  flagged: boolean;
  reasons: string[];
  quote?: string;
  onChange: (v: FieldValue) => void;
  onConfirm: () => void;
}) {
  const id = `survey-${meta.id}`;
  const warn = flagged || reasons.length > 0;
  return (
    <div className={`rounded-[var(--radius)] px-3 ${flagged ? "bg-canary py-2.5" : "py-1"}`} data-field={meta.id}>
      {meta.kind === "yesno" ? (
        <Switch checked={value === true} onChange={onChange} label={meta.label} />
      ) : (
        <div>
          <Label htmlFor={id}>{meta.label}</Label>
          {meta.kind === "enum" && (
            <Select id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
              <option value="" disabled>
                Válassz…
              </option>
              {meta.options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
          {meta.kind === "count" && (
            <Select
              id={id}
              className="sm:max-w-[10rem]"
              value={typeof value === "number" ? String(value) : ""}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">nincs</option>
              {Array.from({ length: MAX_COUNT }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </Select>
          )}
          {meta.kind === "point" && <PointField id={id} value={typeof value === "object" ? value : null} onChange={onChange} />}
        </div>
      )}
      {warn && (
        <div className="mt-1.5 flex flex-col gap-1">
          {flagged && (
            <div>
              <Badge color="var(--pin)">Ellenőrizd</Badge>
            </div>
          )}
          {reasons.map((r) => (
            <p key={r} className="text-[13px] text-heading">
              {r}
            </p>
          ))}
          {flagged && quote && <p className="line-clamp-3 text-[13px] italic text-muted">»{quote}«</p>}
        </div>
      )}
      {flagged && !(meta.kind === "enum" && value === null) && (
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={onConfirm}>
          Rendben
        </Button>
      )}
    </div>
  );
}

const NUMBER_RE = /^\d+(\.\d+)?$/;

/** A number in points or percent; empty means "nincs". Keeps its own text so "2," can be typed. */
function PointField({ id, value, onChange }: { id: string; value: NumberValue | null; onChange: (v: NumberValue | null) => void }) {
  const [text, setText] = useState(value ? String(value.value).replace(".", ",") : "");
  const [percent, setPercent] = useState(value?.percent ?? false);
  const emit = (t: string, p: boolean) => {
    const clean = t.trim().replace(",", ".");
    const n = NUMBER_RE.test(clean) ? Number(clean) : null;
    onChange(n === null || n > 10000 ? null : { value: n, percent: p });
  };
  return (
    <div className="flex gap-2 sm:max-w-xs">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder="nincs"
        onChange={(e) => {
          setText(e.target.value);
          emit(e.target.value, percent);
        }}
      />
      <Select
        aria-label="Mértékegység"
        className="w-24 shrink-0"
        value={percent ? "percent" : "points"}
        onChange={(e) => {
          const p = e.target.value === "percent";
          setPercent(p);
          emit(text, p);
        }}
      >
        <option value="points">pont</option>
        <option value="percent">%</option>
      </Select>
    </div>
  );
}
