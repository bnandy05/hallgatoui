"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { format } from "date-fns";
import { Download, Sparkles, Trash2, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseAppData } from "@/lib/importData";
import type { AppData } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function DataSettings() {
  const courses = useStore((s) => s.courses);
  const deadlines = useStore((s) => s.deadlines);
  const ignoredDuplicatePairs = useStore((s) => s.ignoredDuplicatePairs);
  const classSessions = useStore((s) => s.classSessions);
  const timetableSources = useStore((s) => s.timetableSources);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const feeds = useStore((s) => s.feeds);
  const importData = useStore((s) => s.importData);
  const resetAll = useStore((s) => s.resetAll);
  const loadDemo = useStore((s) => s.loadDemo);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  function handleExport() {
    const data: AppData = { version: 1, courses, deadlines, customPlatforms, feeds,
      ignoredDuplicatePairs,
      classSessions,
      timetableSources,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hallgatoi-reteg-${format(new Date(), "yyyy-MM-dd")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImportError(null);
    setImportSuccess(null);

    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const data = parseAppData(json);

      if (!confirm("A mentés felülírja a fiókod jelenlegi adatait. Folytatod?")) {
        return;
      }

      importData(data);
      setImportSuccess(
        `Visszaállítva: ${data.courses.length} tárgy, ${data.deadlines.length} határidő`
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Nem érvényes mentésfájl");
    } finally {
      // Reset so choosing the same file again re-fires onChange.
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleReset() {
    if (confirm("Minden adat törlődik a fiókodból, minden eszközről. Biztosan folytatod?")) {
      setImportError(null);
      setImportSuccess(null);
      resetAll();
    }
  }

  function handleLoadDemo() {
    loadDemo();
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionHeading
        title="Adatok"
        sub="Az adataid a fiókodban tárolódnak. Biztonsági mentést fájlba is készíthetsz."
      />

      <div className="sheet-paper divide-y divide-border/70 px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium text-heading">Mentés</p>
            <p className="text-[13px] text-muted">Egy fájl mindennel: tárgyak, határidők, linkek, források.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Letöltés
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Visszaállítás
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
              aria-label="Mentésfájl kiválasztása"
            />
          </div>
          {importError && <p className="basis-full text-[13px] font-semibold text-danger">{importError}</p>}
          {importSuccess && <p className="basis-full text-[13px] font-semibold text-success">{importSuccess}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium text-heading">Mintaadatok</p>
            <p className="text-[13px] text-muted">Minta tárgyak és határidők az oldal kipróbálásához.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleLoadDemo}>
            <Sparkles className="h-4 w-4" />
            Betöltés
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border-2 border-dashed border-danger/40 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium text-danger">Minden adat törlése</p>
          <p className="text-[13px] text-muted">Nem vonható vissza. Előtte érdemes mentést letölteni.</p>
        </div>
        <Button type="button" variant="danger" size="sm" onClick={handleReset}>
          <Trash2 className="h-4 w-4" />
          Törlés
        </Button>
      </div>
    </section>
  );
}
