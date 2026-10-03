"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { format } from "date-fns";
import { Loader2, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { useStore, type SubjectDecision } from "@/lib/store";
import { fetchFeed } from "@/lib/ical/client";
import { parseIcs } from "@/lib/ical/parse";
import {
  isNeptunCalendar,
  parseNeptunEvents,
  summarizeSubjects,
  type ParsedSession,
} from "@/lib/ical/neptun";
import type { IcalEventDTO } from "@/lib/ical/types";
import { normalizeLinkUrl } from "@/lib/url";
import { TimetableMappingDialog } from "@/components/TimetableMappingDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SectionHeading } from "@/components/ui/SectionHeading";

const SOURCE_NAME = "Neptun órarend";

interface PendingImport {
  parsed: ParsedSession[];
  sourceId?: string;
  url?: string;
}

function normalizeTimetableUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^webcal:\/\//i.test(trimmed)) return normalizeLinkUrl(`https://${trimmed.slice("webcal://".length)}`);
  return normalizeLinkUrl(trimmed);
}

const day = (iso: string) => format(new Date(iso), "yyyy. MM. dd.");

export function TimetableSettings() {
  const sources = useStore((s) => s.timetableSources);
  const sessions = useStore((s) => s.classSessions);
  const importTimetable = useStore((s) => s.importTimetable);
  const remapTimetable = useStore((s) => s.remapTimetable);
  const removeTimetableSource = useStore((s) => s.removeTimetableSource);

  const fileRef = useRef<HTMLInputElement>(null);
  const reimportRef = useRef<string | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const stats = useMemo(
    () =>
      new Map(
        sources.map((source) => {
          const own = sessions.filter((s) => s.sourceId === source.id);
          const classes = own.filter((s) => s.kind === "ora");
          const starts = own.map((s) => s.start).sort();
          return [
            source.id,
            { classes: classes.length, from: starts[0], to: starts[starts.length - 1] },
          ] as const;
        })
      ),
    [sources, sessions]
  );

  /** Subjects the dialog has to ask about: all of them, or only the new ones on a re-import. */
  function subjectsToAsk(p: PendingImport) {
    const known = p.sourceId ? useStore.getState().timetableSources.find((s) => s.id === p.sourceId)?.subjectCourses : undefined;
    return summarizeSubjects(p.parsed).filter((s) => !known || known[s.subjectKey] === undefined);
  }

  function startImport(next: PendingImport) {
    if (subjectsToAsk(next).length === 0) {
      importTimetable({ sourceId: next.sourceId, name: SOURCE_NAME, url: next.url }, next.parsed, {});
      return;
    }
    setPending(next);
  }

  function handleEvents(events: IcalEventDTO[], text: string | undefined, sourceId?: string, sourceUrl?: string) {
    if (
      !isNeptunCalendar(events, text) &&
      !confirm("Ez a fájl nem tűnik Neptun órarendnek. Biztosan ezt szeretnéd importálni?")
    ) {
      return;
    }
    const parsed = parseNeptunEvents(events);
    if (parsed.length === 0) {
      setError("A fájlban nincs egyetlen esemény sem");
      return;
    }
    startImport({ parsed, sourceId, url: sourceUrl });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sourceId = reimportRef.current ?? undefined;
    reimportRef.current = null;
    setError(null);
    if (!file) return;
    try {
      // Parsed right here: the file never leaves the browser.
      const text = await file.text();
      handleEvents(parseIcs(text), text, sourceId);
    } catch {
      setError("Nem sikerült beolvasni a fájlt. Az órarend .ics fájlját válaszd ki.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function fetchFromUrl(rawUrl: string, sourceId?: string) {
    const normalized = normalizeTimetableUrl(rawUrl);
    if (!normalized) {
      setError("Érvénytelen link");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      handleEvents(await fetchFeed(normalized), undefined, sourceId, normalized);
      if (!sourceId) setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "A naptár nem érhető el");
    } finally {
      setBusy(false);
    }
  }

  function handleUrlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void fetchFromUrl(url);
  }

  function handleReimport(sourceId: string, sourceUrl: string | undefined) {
    if (sourceUrl) {
      void fetchFromUrl(sourceUrl, sourceId);
    } else {
      reimportRef.current = sourceId;
      fileRef.current?.click();
    }
  }

  function handleDelete(sourceId: string) {
    if (confirm("Biztosan törlöd az órarendet? A tárgyaid és a határidőid megmaradnak.")) {
      removeTimetableSource(sourceId);
    }
  }

  const editing = editingId ? sources.find((s) => s.id === editingId) : undefined;
  const editSubjects = useMemo(
    () => summarizeSubjects(sessions.filter((s) => s.sourceId === editingId)),
    [sessions, editingId]
  );

  return (
    <section id="orarend" className="flex flex-col gap-4">
      <SectionHeading
        title="Neptun-órarend"
        sub="Az órák a heti nézetben, a határidők mellett jelennek meg."
      />

      <Card className="flex flex-col gap-4">
        <p className="text-[14px] text-muted">
          A Neptunban a Naptár → Exportálás menüpontban töltheted le az órarendet .ics fájlként. A fájlt a
          böngésző dolgozza fel, nem kerül fel a szerverre.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={handleFile}
            className="sr-only"
            aria-label="Órarend (.ics) kiválasztása"
            tabIndex={-1}
          />
          <Button
            type="button"
            onClick={() => {
              reimportRef.current = null;
              fileRef.current?.click();
            }}
          >
            <Upload className="h-4 w-4" />
            Órarend importálása
          </Button>
        </div>

        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-1 border-t border-border pt-4">
          <Label htmlFor="timetable-url">Vagy naptárlink</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="timetable-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/orarend.ics"
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" disabled={busy || url.trim() === ""}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Letöltés
            </Button>
          </div>
          <p className="text-[12.5px] text-muted">A szerver a linket csak továbbítja, nem tárolja.</p>
        </form>

        {error && <p className="text-xs text-danger">{error}</p>}

        {sources.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border pt-4">
            {sources.map((source) => {
              const stat = stats.get(source.id);
              return (
                <li key={source.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] bg-inset px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{source.name}</p>
                    <p className="text-xs text-muted">
                      {stat?.classes ?? 0} óra
                      {stat?.from && stat.to && ` · ${day(stat.from)} – ${day(stat.to)}`}
                      {` · importálva: ${day(source.importedAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => handleReimport(source.id, source.url)}>
                      <RefreshCw className="h-4 w-4" />
                      Újraimportálás
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(source.id)}>
                      <Pencil className="h-4 w-4" />
                      Hozzárendelés
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(source.id)} className="text-danger hover:!bg-danger/10">
                      <Trash2 className="h-4 w-4" />
                      Törlés
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <TimetableMappingDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Órarendi tárgyak hozzárendelése"
        subjects={pending ? subjectsToAsk(pending) : []}
        initial={{}}
        onConfirm={(decisions: Record<string, SubjectDecision>) => {
          if (!pending) return;
          importTimetable({ sourceId: pending.sourceId, name: SOURCE_NAME, url: pending.url }, pending.parsed, decisions);
        }}
      />
      <TimetableMappingDialog
        open={editing !== undefined}
        onClose={() => setEditingId(null)}
        title="Hozzárendelés szerkesztése"
        subjects={editSubjects}
        initial={editing?.subjectCourses ?? {}}
        onConfirm={(decisions) => {
          if (editingId) remapTimetable(editingId, decisions);
        }}
      />
    </section>
  );
}
