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
  const customPlatforms = useStore((s) => s.customPlatforms);
  const feeds = useStore((s) => s.feeds);
  const importData = useStore((s) => s.importData);
  const resetAll = useStore((s) => s.resetAll);
  const loadDemo = useStore((s) => s.loadDemo);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  function handleExport() {
    const data: AppData = { version: 1, courses, deadlines, customPlatforms, feeds };
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

      if (!confirm("Felülírja a jelenlegi adatokat?")) {
        return;
      }

      importData(data);
      setImportSuccess(
        `Importálva: ${data.courses.length} tárgy, ${data.deadlines.length} határidő`
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
    if (confirm("Minden adat törlődik ebből a böngészőből. Biztos?")) {
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
        eyebrow="Adatok"
        title="Adatok"
        sub="Az adataid csak ebben a böngészőben tárolódnak. Készíts rendszeresen mentést."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Exportálás (JSON)
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Importálás
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
          Demo adatok betöltése
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
