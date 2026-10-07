"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import { FileText, RefreshCw, Upload, X } from "lucide-react";
import { extractRules, MAX_EXTRACT_CHARS, type Answers } from "@/lib/rules/extract";
import { emptySurvey, SURVEY_MAX_DOC_CHARS, type SurveyDraft } from "@/lib/rules/extract/survey";
import type { SubjectRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { PdfTextError, readPdfText } from "./pdfText";
import { RulesErrors, RulesPreview } from "./RulesPreview";
import { SurveyForm } from "./SurveyForm";

// Setup from the requirements document (a PDF read in the browser, or pasted text). The server has
// Jev read the whole text once (a survey of typed questions) and the student confirms every flagged
// field in a prefilled form (SurveyForm). When Jev is not available, the Hungarian-pattern parser
// runs here instead: if it understands the text, the student answers its open questions and
// checks the preview; if not, the form starts empty. Only a result that passes every check can be
// saved, and a rejected one offers the manual setup.

/** More options than this show as a dropdown instead of pills. */
const MAX_PILLS = 8;
/** Below this the text cannot hold a requirements system. */
const MIN_CHARS = 40;

const UNAVAILABLE = "Az automatikus értelmezés most nem érhető el, töltsd ki a dokumentum alapján.";

type Step =
  | { kind: "paste" }
  | { kind: "loading" }
  | { kind: "survey"; draft: SurveyDraft; truncated: boolean; notice?: string }
  | { kind: "parser" };

type Pdf = { name: string; reading: boolean; error?: string; chars?: number };

/** Does the server's answer look like a survey draft? (Only the shape the form relies on.) */
function isDraft(v: unknown): v is SurveyDraft {
  return typeof v === "object" && v !== null && typeof (v as SurveyDraft).fields === "object" && (v as SurveyDraft).fields !== null;
}

const count = (n: number) => n.toLocaleString("hu-HU");

export function ExtractForm({
  course,
  replacing,
  canShare,
  onSave,
  onManual,
  onCancel,
  onWide,
}: {
  course: { name: string; code?: string };
  replacing: boolean;
  canShare: boolean;
  onSave: (rules: SubjectRules, share: boolean) => void;
  onManual: () => void;
  onCancel: () => void;
  /** The review needs a wider sheet (form beside its preview). */
  onWide?: (wide: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "paste" });
  const [mine, setMine] = useState<Answers>({});
  const [share, setShare] = useState(true);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => onWide?.(step.kind === "survey"), [step.kind, onWide]);

  async function handlePdf(file: File | undefined) {
    if (!file) return;
    setPdf({ name: file.name, reading: true });
    try {
      const read = (await readPdfText(file)).slice(0, MAX_EXTRACT_CHARS);
      setText(read);
      setPdf({ name: file.name, reading: false, chars: read.length });
    } catch (e) {
      console.error("[pdf]", e);
      const detail = e instanceof Error && e.message ? ` (${e.message.slice(0, 120)})` : "";
      const error = e instanceof PdfTextError ? e.message : `A PDF beolvasása nem sikerült. Másold be a szöveget kézzel.${detail}`;
      setPdf({ name: file.name, reading: false, error });
    }
  }

  function removePdf() {
    setPdf(null);
    setText("");
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
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-[var(--radius-slip)] bg-inset px-4 py-4" role="status">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-heading">{pdf && !pdf.error ? pdf.name : "Beillesztett szöveg"}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              A Jev olvassa a dokumentumot és kitölti az űrlapot. Ez legfeljebb fél perc.
            </p>
            <div className="reading-bar mt-3 h-[3px] overflow-hidden rounded-full bg-border" aria-hidden />
          </div>
        </div>
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
    const chars = text.trim().length;
    const loaded = pdf && !pdf.reading && !pdf.error;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void analyse();
        }}
        className="flex flex-col gap-5"
      >
        <p className="text-[14px] text-muted">
          Töltsd fel a tárgy követelményrendszerét. A Jev elolvassa és kitölt egy űrlapot, amit mentés előtt átnézel.
        </p>

        {loaded ? (
          <PdfSlip pdf={pdf} onReplace={handlePdf} onRemove={removePdf} />
        ) : (
          <DropZone reading={pdf?.reading ?? false} error={pdf?.error} onFile={handlePdf} />
        )}

        {loaded ? (
          <details className="group">
            <summary className="cursor-pointer text-[13.5px] font-medium text-heading hover:underline">
              A beolvasott szöveg megtekintése, javítása
            </summary>
            <TextField text={text} onChange={setText} rows={10} className="mt-2" />
          </details>
        ) : (
          <div>
            <Label htmlFor="extract-text">Vagy illeszd be a szövegét</Label>
            <TextField text={text} onChange={setText} rows={7} />
          </div>
        )}

        <p className="text-[12.5px] text-muted">
          A PDF-et a böngésződ olvassa be, a fájl nem kerül hozzánk. A szöveget a Jev (TypeSafe AI) olvassa el, mi nem tároljuk; ne
          illessz be személyes adatot.
          {replacing && " A mentés lecseréli a tárgy mostani szabályait, az eredményeid megmaradnak."}
        </p>

        <DialogActions>
          {chars > 0 && chars < MIN_CHARS && (
            <p className="mr-auto self-center text-[13px] text-muted max-sm:basis-full max-sm:text-center">Ez még túl rövid.</p>
          )}
          <Button type="button" variant="secondary" onClick={onCancel}>
            Mégse
          </Button>
          <Button type="submit" disabled={chars < MIN_CHARS || pdf?.reading}>
            Beolvasás
          </Button>
        </DialogActions>
      </form>
    );
  }

  if (!result) return null;

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-5">
        <RulesErrors
          title="Ezt nem tudtuk automatikusan beállítani"
          errors={result.errors}
          hint="Félig kitöltött beállítást nem mentünk. Válassz sablont, vagy add meg a szabályokat kézzel."
        />
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
    <div className="flex flex-col gap-5">
      <p className="text-[14px] text-muted">
        Az automatikus értelmezés most nem érhető el, ezért a szöveg mintáit olvastuk ki.
        {result.questions.length > 0 && " Amit nem mond ki egyértelműen, azt döntsd el a mondat alapján."}
      </p>

      {result.questions.length > 0 && (
        <section aria-labelledby="parser-questions" className="flex flex-col">
          <h3 id="parser-questions" className="font-display text-[22px] text-heading">
            Kérdések
          </h3>
          <ul className="mt-2 flex flex-col">
            {result.questions.map((q) => {
              const chosen = mine[q.id];
              const answered = q.options.some((o) => o.id === chosen);
              const pick = (id: string) => setMine((m) => ({ ...m, [q.id]: id }));
              return (
                <li
                  key={q.id}
                  className={answered ? "border-t border-border py-3 first:border-t-0" : "-mx-3 my-1 rounded-[var(--radius-slip)] bg-canary px-3 py-3"}
                >
                  <p className="text-[14px] font-semibold text-heading">{q.prompt}</p>
                  {q.quote && (
                    <blockquote className="mt-1.5 line-clamp-3 border-l border-heading/40 pl-2.5 text-[13px] italic text-heading">
                      {q.quote}
                    </blockquote>
                  )}
                  {q.options.length > MAX_PILLS ? (
                    <Select
                      aria-label={q.prompt}
                      className="mt-2.5 sm:max-w-xs"
                      value={answered ? chosen : ""}
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
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {q.options.map((o) => (
                        <Pill key={o.id} active={chosen === o.id} onClick={() => pick(o.id)}>
                          {o.label}
                        </Pill>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-[var(--radius-slip)] bg-inset px-4 py-4">
        <div>
          <h3 className="font-display text-[19px] text-heading">Ezt olvastuk ki</h3>
          {rules && open > 0 && (
            <p className="mt-1 text-[12.5px] text-muted">A megválaszolatlan kérdéseknél ideiglenesen az első lehetőség szerepel.</p>
          )}
        </div>
        {rules ? (
          <RulesPreview rules={rules} />
        ) : open > 0 ? (
          <p className="text-[13.5px] text-muted">Ha minden kérdésre válaszoltál, itt látod, mit olvastunk ki.</p>
        ) : (
          <RulesErrors
            title="A válaszokból még nem áll össze szabály"
            errors={result.errors}
            hint="Javítsd a válaszokat fent, vagy add meg a szabályokat kézzel."
          />
        )}
        {canShare && rules && (
          <div className="border-t border-border">
            <Switch
              checked={share}
              onChange={setShare}
              label="Megosztom a sablont"
              description="Az egyetemed hallgatói, akik ugyanezt a tárgykódot veszik fel, átvehetik a szabályokat. Névtelenül, az eredményeid nélkül."
            />
          </div>
        )}
      </section>

      <Unrecognised lines={result.unrecognised} />

      {result.sources.length > 0 && (
        <details className="text-[13px] text-muted">
          <summary className="cursor-pointer font-medium text-heading hover:underline">Források a szövegből</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.sources.map((s) => (
              <li key={s.label}>
                <span className="text-foreground">{s.label}:</span> <span className="italic">{s.quote}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <DialogActions>
        {open > 0 && (
          <p className="mr-auto self-center text-[13px] text-muted max-sm:basis-full max-sm:text-center" aria-live="polite">
            Még {open} kérdés vár válaszra.
          </p>
        )}
        <Button type="button" variant="ghost" onClick={back}>
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

/** The empty upload slot: a dashed outline where the document goes; click or drop a PDF on it. */
function DropZone({ reading, error, onFile }: { reading: boolean; error?: string; onFile: (file: File | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!reading) onFile(e.dataTransfer.files[0]);
  };
  return (
    <div>
      <button
        type="button"
        disabled={reading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-slip)] border-2 border-dashed px-4 py-7 text-center transition-colors duration-150 disabled:cursor-progress ${
          over ? "border-accent bg-wash/[0.05]" : "border-border-strong hover:border-accent hover:bg-wash/[0.03]"
        }`}
      >
        <Upload className="h-5 w-5 text-muted" aria-hidden />
        <span className="text-[14.5px] font-semibold text-heading">{reading ? "A PDF beolvasása…" : "PDF feltöltése"}</span>
        <span className="text-[13px] text-muted">Húzd ide a fájlt, vagy kattints a kiválasztásához. Legfeljebb 10 MB.</span>
      </button>
      {error && (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <FileInput inputRef={inputRef} onFile={onFile} />
    </div>
  );
}

/** A read PDF: its name and size, with replace and remove. */
function PdfSlip({ pdf, onReplace, onRemove }: { pdf: Pdf; onReplace: (file: File | undefined) => void; onRemove: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const over = (pdf.chars ?? 0) > SURVEY_MAX_DOC_CHARS;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-slip)] border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-paper)]">
      <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-heading" title={pdf.name}>
          {pdf.name}
        </p>
        <p className="text-[12.5px] tabular-nums text-muted">
          {count(pdf.chars ?? 0)} karakter beolvasva
          {over && `, a Jev az első ${count(SURVEY_MAX_DOC_CHARS)}-et olvassa el`}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Másik
      </Button>
      <button
        type="button"
        aria-label="PDF eltávolítása"
        onClick={onRemove}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-heading"
      >
        <X className="h-4 w-4" />
      </button>
      <FileInput inputRef={inputRef} onFile={onReplace} />
    </div>
  );
}

function FileInput({ inputRef, onFile }: { inputRef: RefObject<HTMLInputElement | null>; onFile: (file: File | undefined) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      onChange={(e) => {
        onFile(e.target.files?.[0]);
        e.target.value = "";
      }}
      className="sr-only"
      aria-label="Követelményrendszer (PDF) kiválasztása"
      tabIndex={-1}
    />
  );
}

function TextField({ text, onChange, rows, className = "" }: { text: string; onChange: (t: string) => void; rows: number; className?: string }) {
  const n = text.length;
  return (
    <div className={className}>
      <Textarea
        id="extract-text"
        aria-label="A követelményrendszer szövege"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={MAX_EXTRACT_CHARS}
        placeholder="Például a tárgy Canvas-oldaláról vagy a tantárgyi adatlapról."
      />
      <p className={`mt-1 text-right text-[12px] tabular-nums ${n > SURVEY_MAX_DOC_CHARS ? "text-warning" : "text-muted-dim"}`}>
        {count(n)} karakter
        {n > SURVEY_MAX_DOC_CHARS && `; a Jev az első ${count(SURVEY_MAX_DOC_CHARS)}-et olvassa el`}
      </p>
    </div>
  );
}

function Unrecognised({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer font-medium text-heading hover:underline">
        {lines.length} mondatot nem értettünk
      </summary>
      <p className="mt-1.5 text-[12.5px] text-muted">Nézd meg, nincs-e bennük szabály, amit kézzel kell hozzáadnod.</p>
      <ul className="mt-1.5 flex flex-col gap-1 italic text-muted">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}
