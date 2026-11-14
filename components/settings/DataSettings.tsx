"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { format } from "date-fns";
import { Download, Sparkles, Trash2, Upload } from "lucide-react";
import { selectPayload, useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { ImportError, parseAppData } from "@/lib/importData";
import { downloadBackup } from "@/lib/downloadBackup";
import { useDemoMode } from "@/lib/useDemoMode";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SemesterArchiveSettings } from "./SemesterArchiveSettings";

export function DataSettings() {
  const t = useT();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const locale = useLocale();
  const demo = useDemoMode();
  const importData = useStore((s) => s.importData);
  const resetAll = useStore((s) => s.resetAll);
  const loadDemo = useStore((s) => s.loadDemo);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  function handleExport() {
    const { tombstones: _tombstones, ...data } = selectPayload(useStore.getState()).data;
    void _tombstones;
    downloadBackup(data, `hallgatoi-reteg-${format(new Date(), "yyyy-MM-dd")}.json`);
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

      const ok = await confirm({
        title: t.data.confirmRestoreTitle,
        message: t.data.confirmRestore,
        confirmLabel: t.data.restore,
      });
      if (!ok) return;

      importData(data);
      setImportSuccess(
        t.data.restored(data.courses.length, data.deadlines.length)
      );
    } catch (err) {
      setImportError(err instanceof ImportError && err.code === "unsupported_version" ? t.data.unsupportedVersion : t.data.invalidFile);
    } finally {
      // Reset so choosing the same file again re-fires onChange.
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleReset() {
    const ok = await confirm({
      title: t.data.confirmDeleteAllTitle,
      message: t.data.confirmDeleteAll,
      confirmLabel: t.common.delete,
    });
    if (ok) {
      setImportError(null);
      setImportSuccess(null);
      resetAll();
    }
  }

  function handleLoadDemo() {
    loadDemo(locale);
  }

  return (
    <section className="flex flex-col gap-6">
      {confirmDialog}
      <SectionHeading
        title={t.data.title}
        sub={t.data.sub}
      />

      <div className="sheet-paper divide-y divide-border/70 px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-body font-medium text-heading">{t.data.backup}</p>
            <p className="text-small text-muted">{t.data.backupHint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t.data.download}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {t.data.restore}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
              aria-label={t.data.fileAria}
            />
          </div>
          {importError && <p className="basis-full text-small font-semibold text-danger">{importError}</p>}
          {importSuccess && <p className="basis-full text-small font-semibold text-success">{importSuccess}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-body font-medium text-heading">{t.data.demo}</p>
            <p className="text-small text-muted">{t.data.demoHint}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handleLoadDemo}>
            <Sparkles className="h-4 w-4" />
            {t.data.load}
          </Button>
        </div>
      </div>

      {!demo && <SemesterArchiveSettings />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border-2 border-dashed border-danger/40 px-5 py-4">
        <div className="min-w-0">
          <p className="text-body font-medium text-danger">{t.data.deleteAll}</p>
          <p className="text-small text-muted">{t.data.deleteAllHint}</p>
        </div>
        <Button type="button" variant="danger" size="sm" onClick={handleReset}>
          <Trash2 className="h-4 w-4" />
          {t.common.delete}
        </Button>
      </div>
    </section>
  );
}
