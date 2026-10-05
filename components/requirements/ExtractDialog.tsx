"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileText } from "lucide-react";
import { describeRules } from "@/lib/rules/describe";
import { extractRules, MAX_EXTRACT_CHARS, type Answers } from "@/lib/rules/extract";
import type { SubjectRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";

// Setup from the pasted requirements document: the parser runs here, Jev (through our server)
// answers the questions it can answer confidently, the student answers the rest, and only a
// result that passes every check can be saved. A rejected result offers the manual setup.

interface JevAnswer {
  option: string;
  confidence: number;
}

type JevState = "idle" | "loading" | "done" | "unavailable";

export function ExtractForm({
  replacing,
  canShare,
  onSave,
  onManual,
  onCancel,
}: {
  replacing: boolean;
  canShare: boolean;
  onSave: (rules: SubjectRules, share: boolean) => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [jev, setJev] = useState<Record<string, JevAnswer>>({});
  const [jevState, setJevState] = useState<JevState>("idle");
  const [mine, setMine] = useState<Answers>({});
  const [share, setShare] = useState(true);

  const answers = useMemo(() => {
    const out: Answers = {};
    for (const [id, a] of Object.entries(jev)) out[id] = a.option;
    return { ...out, ...mine };
  }, [jev, mine]);
  const result = useMemo(() => (step === "review" ? extractRules(text, answers) : null), [step, text, answers]);

  async function analyse() {
    const first = extractRules(text);
    setMine({});
    setJev({});
    setStep("review");
    if (!first.ok || first.questions.length === 0) return;
    setJevState("loading");
    try {
      const res = await fetch("/api/kovetelmeny/elemzes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setJevState("unavailable");
        return;
      }
      const data = (await res.json()) as { answers?: Record<string, JevAnswer> };
      setJev(data.answers ?? {});
      setJevState("done");
    } catch {
      setJevState("unavailable");
    }
  }

  if (step === "paste") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void analyse();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <Label htmlFor="extract-text">A követelményrendszer szövege</Label>
          <Textarea
            id="extract-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            maxLength={MAX_EXTRACT_CHARS}
            placeholder="Másold ide a tárgy követelményrendszerét (PDF-ből vagy a Canvas oldaláról)."
          />
          <p className="mt-1.5 text-[12.5px] text-muted">
            A szöveget nem tároljuk. A nem egyértelmű mondatokat a Jev (TypeSafe AI) értelmezi; ne illessz be személyes
            adatot.
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
          <Button type="button" variant="secondary" onClick={() => setStep("paste")}>
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
  return (
    <div className="flex flex-col gap-4">
      {result.questions.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <p className="text-[14px] font-semibold text-heading">Kérdések</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {jevState === "loading"
                ? "A Jev értelmezi a nem egyértelmű mondatokat…"
                : jevState === "unavailable"
                  ? "Az automatikus értelmezés most nem érhető el, válaszolj te."
                  : "Ezt a szöveg nem mondja ki egyértelműen. Döntsd el a mondat alapján."}
            </p>
          </div>
          {result.questions.map((q) => {
            const chosen = answers[q.id];
            const suggestion = jev[q.id];
            return (
              <div key={q.id} className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                <p className="text-[14px] text-foreground">{q.prompt}</p>
                <p className="mt-1 text-[13px] italic text-muted">»{q.quote}«</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <Pill key={o.id} active={chosen === o.id} onClick={() => setMine((m) => ({ ...m, [q.id]: o.id }))}>
                      {o.label}
                    </Pill>
                  ))}
                </div>
                {suggestion && !(q.id in mine) && (
                  <p className="mt-1.5 text-[12.5px] text-muted">
                    A Jev javaslata ({Math.round(suggestion.confidence * 100)}% biztos). Ha nem stimmel, válassz mást.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <p className="text-[14px] font-semibold text-heading">Ezt olvastuk ki</p>
          {open > 0 && (
            <p className="mt-0.5 text-[13px] text-muted">
              A megválaszolatlan kérdéseknél ideiglenesen az első lehetőség szerepel.
            </p>
          )}
        </div>
        {describeRules(result.rules!).map((s) => (
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

      {result.rules!.flags.length > 0 && (
        <section>
          <p className="text-[13px] font-semibold text-foreground">Ellenőrizd</p>
          <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-foreground">
            {result.rules!.flags.map((f) => (
              <li key={f.field} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Unrecognised lines={result.unrecognised} />

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

      {canShare && (
        <Switch
          checked={share}
          onChange={setShare}
          label="Megosztom a sablont"
          description="Az egyetemed hallgatói, akik ugyanezt a tárgykódot veszik fel, átvehetik ezeket a szabályokat. Névtelenül, az eredményeid nélkül."
        />
      )}

      <DialogActions>
        {open > 0 && <p className="mr-auto self-center text-[13px] text-muted">Még {open} kérdés vár válaszra.</p>}
        <Button type="button" variant="secondary" onClick={() => setStep("paste")}>
          Vissza
        </Button>
        <Button type="button" disabled={open > 0 || jevState === "loading"} onClick={() => onSave(result.rules!, canShare && share)}>
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
