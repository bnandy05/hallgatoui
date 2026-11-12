"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronRight, Loader2, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { fetchFeed } from "@/lib/ical/client";
import { isNeptunCalendar } from "@/lib/ical/neptun";
import { getPlatform, platformName } from "@/lib/platforms";
import { useT } from "@/lib/i18n/I18nProvider";
import { CalendarFeedOptions, CalendarLinkField, normalizeFeedUrl, type FeedFields } from "./CalendarFeedFields";
import type { TimetableImport } from "@/components/settings/useTimetableImport";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DialogActions } from "@/components/ui/Dialog";

export function CalendarImportForm({
  timetable, onComplete, onCancel,
}: {
  timetable: Pick<TimetableImport, "importEvents" | "importFile">;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [fields, setFields] = useState<FeedFields>({ url: "", name: "", platformId: "canvas", courseId: "" });
  const [platformTouched, setPlatformTouched] = useState(false);
  const [markPastDone, setMarkPastDone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const url = normalizeFeedUrl(fields.url);
    if (!url) {
      setLinkError(t.feeds.invalidLink);
      return;
    }

    const controller = new AbortController();
    const owner = useStore.getState().ownerUserId;
    const term = useStore.getState().semesterNumber;
    request.current = controller;
    setBusy(true);
    setLinkError(null);
    try {
      // The calendar's contents decide whether it is a timetable or a deadline feed.
      const events = await fetchFeed(url, controller.signal);
      const store = useStore.getState();
      if (controller.signal.aborted || store.ownerUserId !== owner || store.semesterNumber !== term) return;
      const existingFeed = store.feeds.find((feed) => normalizeFeedUrl(feed.url) === url);
      if (existingFeed) {
        store.applyFeedSync(existingFeed.id, events);
      } else if (isNeptunCalendar(events)) {
        const existing = store.timetableSources.find((s) => s.url === url);
        const error = timetable.importEvents(events, { sourceId: existing?.id, url });
        if (error) {
          setLinkError(error);
          return;
        }
      } else {
        const platform = getPlatform(fields.platformId, store.customPlatforms);
        const feedId = store.addFeed({
          name: fields.name.trim() || t.feeds.defaultName(platformName(platform, t.platforms.other)),
          url,
          platformId: fields.platformId,
          courseId: fields.courseId || null,
          markDoneBefore: markPastDone ? new Date().toISOString() : undefined,
        });
        store.applyFeedSync(feedId, events);
      }
      setFields((current) => ({ ...current, url: "" }));
      onComplete?.();
    } catch (err) {
      if (!controller.signal.aborted) setLinkError(err instanceof Error ? err.message : t.feeds.unreachable);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function upload(file: File) {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFileError(null);
    const error = await timetable.importFile(file, {}, controller.signal);
    if (controller.signal.aborted) return;
    setBusy(false);
    setFileError(error);
    if (!error) onComplete?.();
  }

  const add = (
    <Button type="submit" disabled={busy || !fields.url.trim()} className="shrink-0">
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {onCancel ? t.feeds.add : t.home.linkCalendar}
    </Button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
      <div className={onCancel ? undefined : "flex flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-start"}>
        <CalendarLinkField
          id={id}
          value={fields.url}
          error={linkError}
          onChange={(url) => {
            setLinkError(null);
            setFields((f) => {
              const host = url.toLowerCase();
              const inferred = ["canvas", "moodle", "neptun"].find((platform) => host.includes(platform));
              return { ...f, url, platformId: platformTouched ? f.platformId : (inferred ?? f.platformId) };
            });
          }}
        />
        {!onCancel && <div className="sm:mt-6">{add}</div>}
      </div>

      {onCancel && (
        <>
          <CalendarFeedOptions id={id} value={fields} onChange={(patch) => {
            if (patch.platformId) setPlatformTouched(true);
            setFields((f) => ({ ...f, ...patch }));
          }} />
          <Checkbox
            checked={markPastDone}
            onChange={(e) => setMarkPastDone(e.target.checked)}
            label={t.feeds.markPastDoneLabel}
            description={t.feeds.markPastDoneHint}
          />
        </>
      )}

      <details className="group text-small text-muted">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 font-semibold text-heading [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-90" aria-hidden />
          {t.feeds.whereLink}
        </summary>
        <ul className="mt-2 space-y-1.5 pl-5">
          <li><span className="font-semibold text-foreground">{t.feeds.canvasName}</span>{t.feeds.canvasHow}</li>
          <li><span className="font-semibold text-foreground">{t.feeds.moodleName}</span>{t.feeds.moodleHow}</li>
          <li><span className="font-semibold text-foreground">{t.feeds.neptunName}</span>{t.feeds.neptunHow}</li>
          <li><span className="font-semibold text-foreground">{t.feeds.otherName}</span>{t.feeds.otherHow}</li>
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-muted">
        <span>{t.feeds.fileNote}</span>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden />
          {t.feeds.uploadFile}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          hidden
          aria-label={t.feeds.fileAria}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {fileError && <p role="alert" className="text-small font-semibold text-danger">{fileError}</p>}
      {onCancel && (
        <DialogActions>
          <Button type="button" variant="secondary" onClick={onCancel}>{t.common.cancel}</Button>
          {add}
        </DialogActions>
      )}
    </form>
  );
}
