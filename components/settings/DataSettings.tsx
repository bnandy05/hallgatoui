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

      if (!confirm("A mentés felülírja a jelenlegi adatokat. Folytatod?")) {
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
    if (confirm("Minden adat törlődik ebből a böngészőből. Biztosan folytatod?")) {
      setImportError(null);
      setImportSuccess(null);
      resetAll();
    }
  }

  function handleLoadDemo() {
    loadDemo();
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title="Adatok"
        sub="Az adataid csak ebben a böngészőben vannak. Érdemes rendszeresen mentést készíteni."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Mentés letöltése
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Mentés visszaállítása
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFile}
          aria-label="Mentésfájl kiválasztása"
        />

        <Button type="button" variant="secondary" size="sm" onClick={handleLoadDemo}>
          <Sparkles className="h-4 w-4" />
          Mintaadatok betöltése
        </Button>

        <Button type="button" variant="danger" size="sm" onClick={handleReset}>
          <Trash2 className="h-4 w-4" />
          Minden adat törlése
        </Button>
      </div>

      {importError && <p className="text-sm text-danger">{importError}</p>}
      {importSuccess && (
        <p className="text-sm text-success">{importSuccess}</p>
      )}
    </section>
  );
}
