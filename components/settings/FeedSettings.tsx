"use client";

import { useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { fetchFeed, syncAllFeeds, syncFeed } from "@/lib/ical/client";
import { parseIcs } from "@/lib/ical/parse";
import { isNeptunCalendar } from "@/lib/ical/neptun";
import { linkHost, normalizeLinkUrl } from "@/lib/url";
import { dateLocale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { BUILT_IN_PLATFORMS, getPlatform, platformName } from "@/lib/platforms";
import type { IcalFeed, TimetableSource } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { groupContexts, pendingContexts } from "@/lib/ical/discover";
import { DiscoveryDialog } from "@/components/DiscoveryDialog";
import { PlatformIcon } from "@/components/PlatformIcon";
import { TimetableSourceItem } from "@/components/settings/TimetableSourceItem";
import { useTimetableImport } from "@/components/settings/useTimetableImport";

const AUTO_COURSE = "";
const DEFAULT_PLATFORM = "canvas";

function normalizeFeedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^webcal:\/\//i.test(trimmed)) {
    return normalizeLinkUrl(`https://${trimmed.slice("webcal://".length)}`);
  }
  return normalizeLinkUrl(trimmed);
}

interface FeedFormValues {
  name: string;
  url: string;
  platformId: string;
  courseId: string; // AUTO_COURSE for "automatikus"
  markPastDone: boolean; // add form only: mark already-expired deadlines done on the first sync
}

function emptyForm(): FeedFormValues {
  return {
    name: "",
    url: "",
    platformId: DEFAULT_PLATFORM,
    courseId: AUTO_COURSE,
    markPastDone: true,
  };
}

export function FeedSettings() {
  const t = useT();
  const locale = useLocale();
  const feeds = useStore((s) => s.feeds);
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const deadlines = useStore((s) => s.deadlines);
  const addFeed = useStore((s) => s.addFeed);
  const updateFeed = useStore((s) => s.updateFeed);
  const removeFeed = useStore((s) => s.removeFeed);
  const markFeedPastDone = useStore((s) => s.markFeedPastDone);
  const applyFeedSync = useStore((s) => s.applyFeedSync);
  const timetableSources = useStore((s) => s.timetableSources);
  const timetable = useTimetableImport();

  const fileRef = useRef<HTMLInputElement>(null);
  const reimportRef = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reimportingIds, setReimportingIds] = useState<Set<string>>(new Set());

  const [addForm, setAddForm] = useState<FeedFormValues>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Errors from re-importing a timetable from its card (the add sheet is closed then).
  const [listError, setListError] = useState<string | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [platformTouched, setPlatformTouched] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FeedFormValues>(emptyForm());
  const [editError, setEditError] = useState<string | null>(null);

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

  const pendingByFeed = useMemo(() => {
    const counts = new Map<string, number>();
    const pending = pendingContexts(feeds, courses);
    for (const group of groupContexts(pending)) {
      const feedId = group.items[0].feedId;
      counts.set(feedId, (counts.get(feedId) ?? 0) + 1);
    }
    return counts;
  }, [feeds, courses]);

  function deadlineCount(feedId: string): number {
    return deadlines.filter((d) => d.feedId === feedId).length;
  }

  function pastOpenCount(feedId: string): number {
    const now = new Date();
    return deadlines.filter(
      (d) => d.feedId === feedId && !d.done && new Date(d.due) < now
    ).length;
  }

  function handleMarkPastDone(feedId: string, count: number) {
    if (confirm(t.feeds.confirmMarkPastDone(count))) {
      markFeedPastDone(feedId);
    }
  }

  async function handleSyncOne(feedId: string) {
    setSyncingIds((prev) => new Set(prev).add(feedId));
    try {
      await syncFeed(feedId);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(feedId);
        return next;
      });
    }
  }

  async function handleSyncAll() {
    setSyncingAll(true);
    setSyncingIds(new Set(feeds.map((f) => f.id)));
    try {
      await syncAllFeeds();
    } finally {
      setSyncingAll(false);
      setSyncingIds(new Set());
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = normalizeFeedUrl(addForm.url);
    if (!normalizedUrl) {
      setAddError(t.feeds.invalidLink);
      return;
    }

    // Fetch first: the content decides whether this is a timetable or a deadline feed.
    setAdding(true);
    setAddError(null);
    let events;
    try {
      events = await fetchFeed(normalizedUrl);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t.feeds.unreachable);
      setAdding(false);
      return;
    }
    setAdding(false);

    if (isNeptunCalendar(events)) {
      // The same link again re-imports into its existing source instead of adding a second one.
      const existing = timetableSources.find((s) => s.url === normalizedUrl);
      const error = timetable.importEvents(events, { sourceId: existing?.id, url: normalizedUrl });
      if (error) {
        setAddError(error);
        return;
      }
    } else {
      const trimmedName =
        addForm.name.trim() ||
        t.feeds.defaultName(platformName(getPlatform(addForm.platformId, customPlatforms), t.platforms.other));
      const newId = addFeed({
        name: trimmedName,
        url: normalizedUrl,
        platformId: addForm.platformId,
        courseId: addForm.courseId === AUTO_COURSE ? null : addForm.courseId,
        markDoneBefore: addForm.markPastDone ? new Date().toISOString() : undefined,
      });
      applyFeedSync(newId, events);
    }
    setAddForm(emptyForm());
    setPlatformTouched(false);
    setAddOpen(false);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sourceId = reimportRef.current ?? undefined;
    reimportRef.current = null;
    // A re-import starts from a card, so its errors show above the list, not in the add sheet.
    const setError = sourceId ? setListError : setAddError;
    setError(null);
    if (!file) return;
    try {
      // Parsed right here: the file never leaves the browser.
      const text = await file.text();
      const events = parseIcs(text);
      if (!isNeptunCalendar(events, text)) {
        setError(t.feeds.notNeptun);
        return;
      }
      const source = sourceId ? timetableSources.find((s) => s.id === sourceId) : undefined;
      const error = timetable.importEvents(events, { sourceId, url: source?.url });
      setError(error);
      if (!error && !sourceId) setAddOpen(false);
    } catch {
      setError(t.feeds.fileUnreadable);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleReimport(source: TimetableSource) {
    if (!source.url) {
      reimportRef.current = source.id;
      fileRef.current?.click();
      return;
    }
    setReimportingIds((prev) => new Set(prev).add(source.id));
    setListError(null);
    try {
      const events = await fetchFeed(source.url);
      if (!isNeptunCalendar(events)) {
        setListError(t.feeds.notNeptun);
        return;
      }
      setListError(timetable.importEvents(events, { sourceId: source.id, url: source.url }));
    } catch (err) {
      setListError(err instanceof Error ? err.message : t.feeds.unreachable);
    } finally {
      setReimportingIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  }

  function handleAddUrlChange(url: string) {
    setAddForm((f) => {
      if (platformTouched) return { ...f, url };
      const host = url.toLowerCase();
      const platformId = host.includes("canvas")
        ? "canvas"
        : host.includes("moodle")
          ? "moodle"
          : host.includes("neptun")
            ? "neptun"
            : f.platformId;
      return { ...f, url, platformId };
    });
  }

  function startEdit(feed: IcalFeed) {
    setEditingId(feed.id);
    setEditForm({
      name: feed.name,
      url: feed.url,
      platformId: feed.platformId,
      courseId: feed.courseId ?? AUTO_COURSE,
      markPastDone: false,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  function saveEdit(feedId: string) {
    const trimmedName = editForm.name.trim();
    if (!trimmedName) return;

    const normalizedUrl = normalizeFeedUrl(editForm.url);
    if (!normalizedUrl) {
      setEditError(t.feeds.invalidLink);
      return;
    }

    updateFeed(feedId, {
      name: trimmedName,
      url: normalizedUrl,
      platformId: editForm.platformId,
      courseId: editForm.courseId === AUTO_COURSE ? null : editForm.courseId,
    });
    setEditingId(null);
    setEditError(null);
  }

  function handleDelete(feedId: string) {
    if (confirm(t.feeds.confirmDelete)) {
      removeFeed(feedId);
    }
  }

  function platformOptions() {
    return (
      <>
        <optgroup label={t.feeds.builtIn}>
          {BUILT_IN_PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {platformName(p, t.platforms.other)}
            </option>
          ))}
        </optgroup>
        {customPlatforms.length > 0 && (
          <optgroup label={t.feeds.custom}>
            {customPlatforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  }

  function courseOptions() {
    return (
      <>
        <option value={AUTO_COURSE}>{t.feeds.autoCourse}</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </>
    );
  }

  function feedFields(
    form: FeedFormValues,
    setForm: (u: (f: FeedFormValues) => FeedFormValues) => void,
    prefix: string,
    error: string | null,
    onUrlChange?: (url: string) => void
  ) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${prefix}-url`}>{t.feeds.calendarLink}</Label>
          <Input
            id={`${prefix}-url`}
            value={form.url}
            onChange={(e) => (onUrlChange ? onUrlChange(e.target.value) : setForm((f) => ({ ...f, url: e.target.value })))}
            placeholder={t.feeds.linkPlaceholder}
            inputMode="url"
          />
          {error && <p className="mt-1 text-[13px] font-semibold text-danger">{error}</p>}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${prefix}-name`}>{t.feeds.name}</Label>
          <Input
            id={`${prefix}-name`}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t.feeds.namePlaceholder}
          />
        </div>
        <div>
          <Label htmlFor={`${prefix}-platform`}>{t.feeds.platform}</Label>
          <Select
            id={`${prefix}-platform`}
            value={form.platformId}
            onChange={(e) => {
              if (prefix === "feed-add") setPlatformTouched(true);
              setForm((f) => ({ ...f, platformId: e.target.value }));
            }}
          >
            {platformOptions()}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${prefix}-course`}>{t.feeds.course}</Label>
          <Select
            id={`${prefix}-course`}
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
          >
            {courseOptions()}
          </Select>
        </div>
      </div>
    );
  }

  const hasSources = feeds.length > 0 || timetableSources.length > 0;
  const editingFeed = feeds.find((f) => f.id === editingId);

  return (
    <section id="naptarak" className="flex flex-col gap-6">
      <SectionHeading
        title={t.feeds.title}
        sub={t.feeds.sub}
        actions={
          feeds.length > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={handleSyncAll} disabled={syncingAll}>
              {syncingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t.feeds.refreshAll}
            </Button>
          ) : undefined
        }
      />

      {listError && (
        <p role="alert" className="rounded-[var(--radius-slip)] bg-salmon px-4 py-3 text-[14px] font-semibold text-danger">
          {listError}
        </p>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-x-4 gap-y-5">
        {feeds.map((feed, i) => {
          const platform = getPlatform(feed.platformId, customPlatforms);
          const course = feed.courseId ? courses.find((c) => c.id === feed.courseId) : null;
          const isSyncing = syncingIds.has(feed.id);
          const pastOpen = pastOpenCount(feed.id);
          const pending = pendingByFeed.get(feed.id) ?? 0;
          return (
            <li
              key={feed.id}
              className="slip flex min-w-0 flex-col gap-3 bg-card px-4 pb-3 pt-4"
              style={{ "--i": i } as CSSProperties}
            >
              <span
                aria-hidden="true"
                className="pin -top-[4px] left-4"
                style={{ "--pin-color": feed.lastError ? "var(--pin)" : (course?.color ?? "var(--pin-neutral)") } as CSSProperties}
              />
              <div className="flex items-start gap-3">
                <PlatformIcon platform={platform} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold text-heading">{feed.name}</p>
                  <p className="truncate text-[12.5px] text-muted-dim" title={feed.url}>
                    {linkHost(feed.url)}
                  </p>
                </div>
              </div>
              <p className="text-[13.5px] text-muted">
                {course ? course.name : t.feeds.courseByKeyword} · {t.feeds.deadlineCount(deadlineCount(feed.id))}
              </p>
              <p className={`text-[13px] ${feed.lastError ? "font-semibold text-danger" : "text-muted"}`}>
                {feed.lastError ? (
                  feed.lastError
                ) : feed.lastSyncedAt ? (
                  <>
                    <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-middle" />
                    {t.feeds.updated(formatDistanceToNow(new Date(feed.lastSyncedAt), { locale: dateLocale(locale), addSuffix: true }))}
                  </>
                ) : (
                  t.feeds.neverUpdated
                )}
              </p>
              {(pending > 0 || pastOpen > 0) && (
                <div className="flex flex-wrap gap-2">
                  {pending > 0 && (
                    <Button type="button" size="sm" onClick={() => setDiscoveryOpen(true)}>
                      {t.feeds.addCourses(pending)}
                    </Button>
                  )}
                  {pastOpen > 0 && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleMarkPastDone(feed.id, pastOpen)}>
                      {t.feeds.markPastDone(pastOpen)}
                    </Button>
                  )}
                </div>
              )}
              <div className="-mx-1.5 mt-auto flex flex-wrap items-center gap-1 border-t border-border/70 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => handleSyncOne(feed.id)} disabled={isSyncing}>
                  {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t.feeds.refresh}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(feed)}>
                  <Pencil className="h-4 w-4" />
                  {t.common.edit}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(feed.id)}
                  aria-label={t.feeds.deleteAria(feed.name)}
                  className="ml-auto text-danger hover:!bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" />
                  {t.common.delete}
                </Button>
              </div>
            </li>
          );
        })}
        {timetableSources.map((source) => (
          <TimetableSourceItem
            key={source.id}
            source={source}
            busy={reimportingIds.has(source.id)}
            onReimport={handleReimport}
            onEditMapping={timetable.editMapping}
          />
        ))}
        <li className={hasSources ? "" : "col-span-full"}>
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddOpen(true);
            }}
            className="flex h-full min-h-[9rem] w-full flex-col items-center justify-center gap-1.5 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-6 py-6 text-center text-muted transition-colors hover:border-accent hover:text-heading"
          >
            <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-heading">
              <Plus className="h-4 w-4" />
              {hasSources ? t.feeds.newCalendar : t.feeds.addCalendar}
            </span>
            {!hasSources && (
              <span className="max-w-sm text-[13.5px]">{t.feeds.addHint}</span>
            )}
          </button>
        </li>
      </ul>

      <input
        ref={fileRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={(e) => void handleFile(e)}
        className="sr-only"
        aria-label={t.feeds.fileAria}
        tabIndex={-1}
      />

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title={t.feeds.newCalendar}>
        <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-4">
          {feedFields(addForm, setAddForm, "feed-add", addError, handleAddUrlChange)}
          <label className="flex items-start gap-2 text-[14px] text-foreground">
            <input
              type="checkbox"
              checked={addForm.markPastDone}
              onChange={(e) => setAddForm((f) => ({ ...f, markPastDone: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              {t.feeds.markPastDoneLabel}
              <span className="block text-[12.5px] text-muted">{t.feeds.markPastDoneHint}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] bg-inset px-3 py-2.5 text-[13.5px] text-muted">
            <span className="min-w-0 flex-1">{t.feeds.fileNote}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                reimportRef.current = null;
                fileRef.current?.click();
              }}
            >
              <Upload className="h-4 w-4" />
              {t.feeds.uploadFile}
            </Button>
          </div>
          <details className="group text-[13.5px] text-muted">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-heading [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-90" />
              {t.feeds.whereLink}
            </summary>
            <ul className="mt-2 space-y-1.5 pl-5">
              <li>
                <span className="font-semibold text-foreground">{t.feeds.canvasName}</span>{t.feeds.canvasHow}
              </li>
              <li>
                <span className="font-semibold text-foreground">{t.feeds.moodleName}</span>{t.feeds.moodleHow}
              </li>
              <li>
                <span className="font-semibold text-foreground">{t.feeds.neptunName}</span>{t.feeds.neptunHow}
              </li>
              <li>
                <span className="font-semibold text-foreground">{t.feeds.otherName}</span>{t.feeds.otherHow}
              </li>
            </ul>
          </details>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={adding || addForm.url.trim().length === 0}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.feeds.add}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={editingFeed !== undefined} onClose={cancelEdit} title={t.feeds.editTitle}>
        {editingFeed && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit(editingFeed.id);
            }}
            className="flex flex-col gap-4"
          >
            {feedFields(editForm, setEditForm, "feed-edit", editError)}
            <DialogActions>
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                {t.common.cancel}
              </Button>
              <Button type="submit">{t.common.save}</Button>
            </DialogActions>
          </form>
        )}
      </Dialog>

      {timetable.dialogs}
      <DiscoveryDialog open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
    </section>
  );
}
