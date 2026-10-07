"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Upload } from "lucide-react";
import { describeRules } from "@/lib/rules/describe";
import { extractRules, MAX_EXTRACT_CHARS, type Answers } from "@/lib/rules/extract";
import { emptySurvey, type SurveyDraft } from "@/lib/rules/extract/survey";
import type { SubjectRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { PdfTextError, readPdfText } from "./pdfText";
import { SurveyForm } from "./SurveyForm";

// Setup from the requirements document (pasted, or a PDF read in the browser). The server has Jev
// read the whole text once (a survey of typed questions) and the student confirms every flagged
// field in a prefilled form (SurveyForm). When Jev is not available, the Hungarian-pattern parser
// runs here instead: if it understands the text, the student answers its open questions and
// checks the preview; if not, the form starts empty. Only a result that passes every check can be
// saved, and a rejected one offers the manual setup.

/** More options than this show as a dropdown instead of pills. */
const MAX_PILLS = 8;

const UNAVAILABLE = "Az automatikus értelmezés most nem érhető el, töltsd ki a dokumentum alapján.";

type Step =
  | { kind: "paste" }
  | { kind: "loading" }
  | { kind: "survey"; draft: SurveyDraft; truncated: boolean; notice?: string }
  | { kind: "parser" };

/** Does the server's answer look like a survey draft? (Only the shape the form relies on.) */
function isDraft(v: unknown): v is SurveyDraft {
  return typeof v === "object" && v !== null && typeof (v as SurveyDraft).fields === "object" && (v as SurveyDraft).fields !== null;
}

export function ExtractForm({
  course,
  replacing,
  canShare,
  onSave,
  onManual,
  onCancel,
}: {
  course: { name: string; code?: string };
  replacing: boolean;
  canShare: boolean;
  onSave: (rules: SubjectRules, share: boolean) => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "paste" });
  const [mine, setMine] = useState<Answers>({});
  const [share, setShare] = useState(true);
  const [pdf, setPdf] = useState<{ name: string; reading: boolean; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function handlePdf(file: File | undefined) {
    if (!file) return;
    setPdf({ name: file.name, reading: true });
    try {
      setText((await readPdfText(file)).slice(0, MAX_EXTRACT_CHARS));
      setPdf({ name: file.name, reading: false });
    } catch (e) {
      console.error("[pdf]", e);
      const detail = e instanceof Error && e.message ? ` (${e.message.slice(0, 120)})` : "";
      const error = e instanceof PdfTextError ? e.message : `A PDF beolvasása nem sikerült. Másold be a szöveget kézzel.${detail}`;
      setPdf({ name: file.name, reading: false, error });
    }
  }

  const result = useMemo(() => (step.kind === "parser" ? extractRules(text, mine) : null), [step.kind, text, mine]);

  /** Jev is unavailable: the parser reads the text here, or the form starts empty. */
  function fallback() {
    setMine({});
    if (extractRules(text).ok) setStep({ kind: "parser" });
    else setStep({ kind: "survey", draft: emptySurvey(), truncated: false, notice: UNAVAILABLE });
  }

  async function analyse() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStep({ kind: "loading" });
    try {
      const res = await fetch("/api/kovetelmeny/elemzes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, course: { name: course.name, ...(course.code ? { code: course.code } : {}) } }),
        signal: controller.signal,
      });
      const data = res.ok ? ((await res.json()) as { survey?: unknown; truncated?: boolean }) : null;
      if (controller.signal.aborted) return;
      if (data && isDraft(data.survey)) setStep({ kind: "survey", draft: data.survey, truncated: data.truncated === true });
      else fallback();
    } catch {
      if (!controller.signal.aborted) fallback();
    }
  }

  function back() {
    request.current?.abort();
    setStep({ kind: "paste" });
  }

  if (step.kind === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-foreground" role="status">
          A Jev olvassa a dokumentumot…
        </p>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={back}>
            Mégse
          </Button>
        </DialogActions>
      </div>
    );
  }

  if (step.kind === "survey") {
    return (
      <SurveyForm
        draft={step.draft}
        truncated={step.truncated}
        notice={step.notice}
        canShare={canShare}
        replacing={replacing}
        onSave={onSave}
        onBack={back}
        onManual={onManual}
      />
    );
  }

  if (step.kind === "paste") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void analyse();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" disabled={pdf?.reading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {pdf?.reading ? "Beolvasás…" : "PDF feltöltése"}
            </Button>
            {pdf && !pdf.reading && (
              <p className={`min-w-0 truncate text-[13px] ${pdf.error ? "text-danger" : "text-muted"}`} role={pdf.error ? "alert" : undefined}>
                {pdf.error ?? `${pdf.name}: a szöveget lent ellenőrizheted.`}
              </p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              void handlePdf(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="sr-only"
            aria-label="Követelményrendszer (PDF) kiválasztása"
            tabIndex={-1}
          />
          <Label htmlFor="extract-text">A követelményrendszer szövege</Label>
          <Textarea
            id="extract-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            maxLength={MAX_EXTRACT_CHARS}
            placeholder="Töltsd fel a PDF-et, vagy másold ide a tárgy követelményrendszerét (például a Canvas oldaláról)."
          />
          <p className="mt-1.5 text-[12.5px] text-muted">
            A PDF-et a böngésződ olvassa be, a fájl nem kerül hozzánk. A szöveget a Jev (TypeSafe AI) olvassa el, mi nem tároljuk; ne illessz be személyes adatot.
            {replacing && " A mentés lecseréli a tárgy mostani szabályait, az eredményeid megmaradnak."}
          </p>
        </div>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Mégse
          </Button>
          <Button type="submit" disabled={text.trim().length < 40}>
            Értelmezés
          </Button>
        </DialogActions>
      </form>
    );
  }

  if (!result) return null;

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3" role="alert">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Ezt nem tudtuk automatikusan beállítani
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-foreground">
            {result.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">
            Félig kitöltött beállítást nem mentünk. Válassz sablont, vagy add meg a szabályokat kézzel.
          </p>
        </div>
        <Unrecognised lines={result.unrecognised} />
        <DialogActions>
          <Button type="button" variant="secondary" onClick={back}>
            Vissza
          </Button>
          <Button type="button" onClick={onManual}>
            Kézi beállítás
          </Button>
        </DialogActions>
      </div>
    );
  }

  const open = result.open.length;
  const rules = result.rules;
  return (
    <div className="flex flex-col gap-4">
      {result.questions.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <p className="text-[14px] font-semibold text-heading">Kérdések</p>
            <p className="mt-0.5 text-[13px] text-muted">
              Az automatikus értelmezés most nem érhető el. Ezt a szöveg nem mondja ki egyértelműen, döntsd el a mondat alapján.
            </p>
          </div>
          {result.questions.map((q) => {
            const chosen = mine[q.id];
            const pick = (id: string) => setMine((m) => ({ ...m, [q.id]: id }));
            return (
              <div key={q.id} className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                <p className="text-[14px] text-foreground">{q.prompt}</p>
                {q.quote && <p className="mt-1 line-clamp-3 text-[13px] italic text-muted">»{q.quote}«</p>}
                {q.options.length > MAX_PILLS ? (
                  <Select
                    aria-label={q.prompt}
                    className="mt-2 sm:max-w-xs"
                    value={q.options.some((o) => o.id === chosen) ? chosen : ""}
                    onChange={(e) => pick(e.target.value)}
                  >
                    <option value="" disabled>
                      Válassz…
                    </option>
                    {q.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <Pill key={o.id} active={chosen === o.id} onClick={() => pick(o.id)}>
                        {o.label}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!rules && result.errors.length > 0 && open === 0 && (
        <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3" role="alert">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            A válaszokból még nem áll össze érvényes szabály
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-foreground">
            {result.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">Javítsd a válaszokat fent, vagy add meg a szabályokat kézzel.</p>
        </div>
      )}

      {!rules && open > 0 && (
        <p className="text-[13px] text-muted">Ha minden kérdésre válaszoltál, itt látod, mit olvastunk ki.</p>
      )}

      {rules && (
        <section className="flex flex-col gap-3">
          <div>
            <p className="text-[14px] font-semibold text-heading">Ezt olvastuk ki</p>
            {open > 0 && (
              <p className="mt-0.5 text-[13px] text-muted">
                A megválaszolatlan kérdéseknél ideiglenesen az első lehetőség szerepel.
              </p>
            )}
          </div>
          {describeRules(rules).map((s) => (
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
        </section>
      )}

      {rules && rules.flags.length > 0 && (
        <section>
          <p className="text-[13px] font-semibold text-foreground">Ellenőrizd</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-foreground">
            {rules.flags.map((f) => (
              <li key={f.field} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Unrecognised lines={result.unrecognised} />

      {result.sources.length > 0 && (
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer">Források a szövegből</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.sources.map((s) => (
              <li key={s.label}>
                <span className="text-foreground">{s.label}:</span> »{s.quote}«
              </li>
            ))}
          </ul>
        </details>
      )}

      {canShare && rules && (
        <Switch
          checked={share}
          onChange={setShare}
          label="Megosztom a sablont"
          description="Az egyetemed hallgatói, akik ugyanezt a tárgykódot veszik fel, átvehetik ezeket a szabályokat. Névtelenül, az eredményeid nélkül."
        />
      )}

      <DialogActions>
        {open > 0 && <p className="mr-auto self-center text-[13px] text-muted">Még {open} kérdés vár válaszra.</p>}
        <Button type="button" variant="secondary" onClick={back}>
          Vissza
        </Button>
        {!rules && open === 0 && (
          <Button type="button" variant="secondary" onClick={onManual}>
            Kézi beállítás
          </Button>
        )}
        <Button type="button" disabled={!rules || open > 0} onClick={() => rules && onSave(rules, canShare && share)}>
          Mentés
        </Button>
      </DialogActions>
    </div>
  );
}

function Unrecognised({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <FileText className="h-3.5 w-3.5 text-muted" aria-hidden />
        Ezeket a mondatokat nem értettük
      </p>
      <p className="text-[12.5px] text-muted">Nézd meg, nincs-e bennük szabály, amit kézzel kell hozzáadnod.</p>
      <ul className="mt-1 flex flex-col gap-1 text-[13px] italic text-muted">
        {lines.map((l) => (
          <li key={l}>»{l}«</li>
        ))}
      </ul>
    </section>
  );
}
