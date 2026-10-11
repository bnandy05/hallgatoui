"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CalendarPlus, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { parseView, viewParam } from "@/lib/ical/views";
import {
  createCalendarToken,
  deleteCalendarToken,
  downloadCalendar,
  fetchCalendarToken,
  rotateCalendarToken,
  subscriptionPath,
} from "@/lib/subscription/client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { CopyField } from "@/components/ui/CopyField";
import { Switch } from "@/components/ui/Switch";
import { SectionHeading } from "@/components/ui/SectionHeading";

type Busy = "create" | "rotate" | "delete" | null;

export function CalendarSubscriptionSettings() {
  const t = useT();
  const courses = useStore((s) => s.courses);
  const exportOptions = useStore((s) => s.exportOptions);
  const setExportOptions = useStore((s) => s.setExportOptions);
  const ignoredCount = useStore((s) => s.ignoredDuplicatePairs.length);
  const clearIgnoredDuplicates = useStore((s) => s.clearIgnoredDuplicates);

  // undefined: still loading; null: the subscription is off.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewValue, setViewValue] = useState("osszes");

  useEffect(() => {
    let cancelled = false;
    void fetchCalendarToken().then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setToken(result.token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(
    kind: Exclude<Busy, null>,
    action: () => Promise<{ token: string | null } | { error: string }>
  ) {
    setBusy(kind);
    setError(null);
    const result = await action();
    if ("error" in result) setError(result.error);
    else setToken(result.token);
    setBusy(null);
  }

  function handleRotate() {
    if (!confirm(t.calendarExport.confirmRotate)) {
      return;
    }
    void run("rotate", rotateCalendarToken);
  }

  function handleDisable() {
    if (!confirm(t.calendarExport.confirmDisable)) {
      return;
    }
    void run("delete", async () => {
      const message = await deleteCalendarToken();
      return message ? { error: message } : { token: null };
    });
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // A deleted course falls back to the full calendar, like the server does.
  const view = parseView(viewValue, courses);
  const query = view.kind === "all" ? "" : `?nezet=${encodeURIComponent(viewParam(view))}`;
  const path = token ? `${subscriptionPath(token)}${query}` : "";
  const httpsUrl = `${origin}${path}`;
  const webcalUrl = `webcal://${origin.replace(/^https?:\/\//, "")}${path}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  const spinner = <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <section id="naptar-exportalas" className="flex flex-col gap-8">
      <SectionHeading
        title={t.calendarExport.title}
        sub={t.calendarExport.sub}
      />

      {token === undefined ? (
        error ? (
          <p className="text-[13px] font-semibold text-danger">{error}</p>
        ) : (
          <div className="h-40 rounded-[var(--radius-slip)] bg-strip/80" />
        )
      ) : token === null ? (
        <div className="slip flex flex-col gap-4 bg-card px-5 pb-5 pt-6">
          <span aria-hidden="true" className="pin -top-[4px] left-5" style={{ "--pin-color": "var(--pin-neutral)" } as CSSProperties} />
          <p className="font-display text-[22px] text-heading">{t.calendarExport.autoUpdating}</p>
          <div className="flex gap-2.5 rounded-[var(--radius)] bg-canary/60 p-3 text-[13.5px] text-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              {t.calendarExport.secretWarning}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy !== null} onClick={() => void run("create", createCalendarToken)}>
              {busy === "create" ? spinner : <CalendarPlus className="h-4 w-4" />}
              {t.calendarExport.createLink}
            </Button>
            <Button type="button" variant="secondary" onClick={downloadCalendar}>
              <Download className="h-4 w-4" />
              {t.calendarExport.downloadIcs}
            </Button>
          </div>
          <p className="text-[13px] text-muted">
            {t.calendarExport.downloadNote}
          </p>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        </div>
      ) : (
        <div className="slip flex flex-col gap-4 bg-card px-5 pb-5 pt-6">
          <span aria-hidden="true" className="pin -top-[4px] left-5" style={{ "--pin-color": "var(--success)" } as CSSProperties} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-display text-[22px] text-heading">{t.calendarExport.subscriptionLink}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="min-w-0">
              <CopyField value={httpsUrl} label={t.calendarExport.subscriptionLink} />
              <p className="mt-2 text-[12.5px] text-muted">{t.calendarExport.keepPrivate}</p>
            </div>
            <div>
              <Label htmlFor="naptar-nezet">{t.calendarExport.view}</Label>
              <Select
                id="naptar-nezet"
                value={view.kind === "all" ? "osszes" : viewValue}
                onChange={(e) => setViewValue(e.target.value)}
              >
                <option value="osszes">{t.calendarExport.viewAll}</option>
                <option value="kritikus">{t.calendarExport.viewCritical}</option>
                <option value="zh">{t.calendarExport.viewExams}</option>
                <option value="orarend">{t.calendarExport.viewTimetable}</option>
                {courses.map((c) => (
                  <option key={c.id} value={`targy-${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
            <a href={webcalUrl} className={buttonClasses({ variant: "secondary" })}>
              {t.calendarExport.addApple}
            </a>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
              {t.calendarExport.addGoogle}
            </a>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>{t.calendarExport.tip1}</li>
            <li>{t.calendarExport.tip2}</li>
            <li>{t.calendarExport.tip3}</li>
          </ul>
          {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] text-heading">{t.calendarExport.content}</h3>
        <div className="sheet-paper divide-y divide-border/70 px-5 py-1">
          <Switch
            checked={exportOptions.includeDone}
            onChange={(v) => setExportOptions({ includeDone: v })}
            label={t.calendarExport.includeDone}
            description={t.calendarExport.includeDoneHint}
          />
          <Switch
            checked={exportOptions.includeClasses}
            onChange={(v) => setExportOptions({ includeClasses: v })}
            label={t.calendarExport.includeClasses}
            description={t.calendarExport.includeClassesHint}
          />
          <Switch
            checked={exportOptions.dedupe}
            onChange={(v) => setExportOptions({ dedupe: v })}
            label={t.calendarExport.dedupe}
            description={
              <>
                {t.calendarExport.dedupeHint}
                {ignoredCount > 0 && (
                  <button
                    type="button"
                    onClick={clearIgnoredDuplicates}
                    className="ml-1 font-semibold text-heading underline"
                  >
                    {t.calendarExport.clearExceptions(ignoredCount)}
                  </button>
                )}
              </>
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-[22px] text-heading">{t.calendarExport.extras}</h3>
        <div className="sheet-paper divide-y divide-border/70 px-5 py-1">
          <Switch
            checked={exportOptions.alarms}
            onChange={(v) => setExportOptions({ alarms: v })}
            label={t.calendarExport.alarms}
            description={t.calendarExport.alarmsHint}
          />
          <Switch
            checked={exportOptions.weeklySummary}
            onChange={(v) => setExportOptions({ weeklySummary: v })}
            label={t.calendarExport.weeklySummary}
            description={t.calendarExport.weeklySummaryHint}
          />
          <Switch
            checked={exportOptions.studyBlocks}
            onChange={(v) => setExportOptions({ studyBlocks: v })}
            label={t.calendarExport.studyBlocks}
            description={t.calendarExport.studyBlocksHint}
          />
        </div>
      </div>

      {token && (
        <div className="flex flex-wrap items-center gap-2 border-t border-felt-dark pt-5">
          <Button type="button" variant="secondary" onClick={downloadCalendar}>
            <Download className="h-4 w-4" />
            {t.calendarExport.downloadIcs}
          </Button>
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={handleRotate}>
            {busy === "rotate" ? spinner : <RefreshCw className="h-4 w-4" />}
            {t.calendarExport.newLink}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={handleDisable}
            className="text-danger hover:!bg-danger/10 sm:ml-auto"
          >
            {busy === "delete" && spinner}
            {t.calendarExport.disable}
          </Button>
        </div>
      )}
    </section>
  );
}
