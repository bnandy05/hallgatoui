"use client";

import { useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { fetchFeed, syncAllFeeds, syncFeed } from "@/lib/ical/client";
import { isNeptunCalendar } from "@/lib/ical/neptun";
import { linkHost } from "@/lib/url";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { formatRelative } from "@/lib/radar";
import { getPlatform } from "@/lib/platforms";
import type { IcalFeed, TimetableSource } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { groupContexts, pendingContexts } from "@/lib/ical/discover";
import { DiscoveryDialog } from "@/components/DiscoveryDialog";
import { PlatformIcon } from "@/components/PlatformIcon";
import { TimetableSourceItem } from "@/components/settings/TimetableSourceItem";
import { useTimetableImport } from "@/components/settings/useTimetableImport";
import { SemesterField } from "@/components/settings/SemesterField";

import { CalendarImportForm } from "@/components/calendar/CalendarImportForm";
import { CalendarFeedOptions, CalendarLinkField, normalizeFeedUrl, type FeedFields } from "@/components/calendar/CalendarFeedFields";

export function FeedSettings() {
  const t = useT();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const locale = useLocale();
  const feeds = useStore((s) => s.feeds);
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const deadlines = useStore((s) => s.deadlines);
  const updateFeed = useStore((s) => s.updateFeed);
  const removeFeed = useStore((s) => s.removeFeed);
  const markFeedPastDone = useStore((s) => s.markFeedPastDone);
  const timetableSources = useStore((s) => s.timetableSources);
  const timetable = useTimetableImport();

  const fileRef = useRef<HTMLInputElement>(null);
  const reimportRef = useRef<string | null>(null);
  const [reimportingIds, setReimportingIds] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  // Errors from re-importing a timetable from its card (the add sheet is closed then).
  const [listError, setListError] = useState<string | null>(null);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FeedFields>({ url: "", name: "", platformId: "canvas", courseId: "" });
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

  async function handleMarkPastDone(feedId: string, count: number) {
    const ok = await confirm({
      title: t.feeds.confirmMarkPastDoneTitle,
      message: t.feeds.confirmMarkPastDone(count),
      confirmLabel: t.feeds.confirmMarkPastDoneLabel,
      tone: "default",
    });
    if (ok) markFeedPastDone(feedId);
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

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    const sourceId = reimportRef.current;
    reimportRef.current = null;
    if (!file || !sourceId) return;
    setListError(null);
    setListError(await timetable.importFile(file, { sourceId }));
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

  function startEdit(feed: IcalFeed) {
    setEditingId(feed.id);
    setEditForm({
      name: feed.name,
      url: feed.url,
      platformId: feed.platformId,
      courseId: feed.courseId ?? "",
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
    if (feeds.some((feed) => feed.id !== feedId && normalizeFeedUrl(feed.url) === normalizedUrl)) {
      setEditError(t.feeds.alreadyConnected);
      return;
    }

    updateFeed(feedId, {
      name: trimmedName,
      url: normalizedUrl,
      platformId: editForm.platformId,
      courseId: editForm.courseId || null,
    });
    setEditingId(null);
    setEditError(null);
  }

  async function handleDelete(feedId: string) {
    const ok = await confirm({
      title: t.feeds.confirmDeleteTitle,
      message: t.feeds.confirmDelete,
      confirmLabel: t.common.delete,
    });
    if (ok) removeFeed(feedId);
  }

  const hasSources = feeds.length > 0 || timetableSources.length > 0;
  const editingFeed = feeds.find((f) => f.id === editingId);

  return (
    <section id="naptarak" data-tour="feeds" className="flex flex-col gap-6">
      {confirmDialog}
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
        <p role="alert" className="rounded-[var(--radius-slip)] bg-salmon px-4 py-3 text-body font-semibold text-danger">
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
                  <p className="truncate text-lead font-bold text-heading">{feed.name}</p>
                  <p className="truncate text-fine text-muted-dim" title={feed.url}>
                    {linkHost(feed.url)}
                  </p>
                </div>
              </div>
              <p className="text-small text-muted">
                {course ? course.name : t.feeds.courseByKeyword} · {t.feeds.deadlineCount(deadlineCount(feed.id))}
              </p>
              <p className={`text-small ${feed.lastError ? "font-semibold text-danger" : "text-muted"}`}>
                {feed.lastError ? (
                  feed.lastError
                ) : feed.lastSyncedAt ? (
                  <>
                    <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success align-middle" />
                    {t.feeds.updated(formatRelative(new Date(feed.lastSyncedAt), new Date(), locale))}
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
            onClick={() => setAddOpen(true)}
            className="flex h-full min-h-[9rem] w-full flex-col items-center justify-center gap-1.5 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-6 py-6 text-center text-muted transition-colors hover:border-accent hover:text-heading"
          >
            <span className="inline-flex items-center gap-2 text-body font-semibold text-heading">
              <Plus className="h-4 w-4" />
              {hasSources ? t.feeds.newCalendar : t.feeds.addCalendar}
            </span>
            {!hasSources && (
              <span className="max-w-sm text-small">{t.feeds.addHint}</span>
            )}
          </button>
        </li>
      </ul>

      {timetableSources.length > 0 && (
        <div className="sheet-paper px-4 py-3.5">
          <SemesterField />
        </div>
      )}

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
        <CalendarImportForm
          timetable={timetable}
          onComplete={() => setAddOpen(false)}
          onCancel={() => setAddOpen(false)}
        />
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
              <CalendarLinkField
              id="feed-edit-url"
              value={editForm.url}
              error={editError}
              onChange={(url) => setEditForm((form) => ({ ...form, url }))}
            />
            <CalendarFeedOptions
              id="feed-edit"
              value={editForm}
              onChange={(patch) => setEditForm((form) => ({ ...form, ...patch }))}
            />
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
