"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { Loader2, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { fetchFeed, syncAllFeeds, syncFeed } from "@/lib/ical/client";
import { parseIcs } from "@/lib/ical/parse";
import { isNeptunCalendar } from "@/lib/ical/neptun";
import { normalizeLinkUrl } from "@/lib/url";
import { BUILT_IN_PLATFORMS, getPlatform } from "@/lib/platforms";
import type { IcalFeed, TimetableSource } from "@/lib/types";
import { Button } from "@/components/ui/Button";
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
const NOT_NEPTUN_ERROR =
  "Ez nem Neptun órarend. Canvas vagy Moodle naptárat linkkel adj hozzá, hogy frissülni tudjon.";

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
    if (confirm(`${count} lejárt határidő késznek lesz jelölve. Folytatod?`)) {
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
      setAddError("Érvénytelen link");
      return;
    }

    // Fetch first: the content decides whether this is a timetable or a deadline feed.
    setAdding(true);
    setAddError(null);
    let events;
    try {
      events = await fetchFeed(normalizedUrl);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "A naptár nem érhető el");
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
        `${getPlatform(addForm.platformId, customPlatforms).name} naptár`;
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
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sourceId = reimportRef.current ?? undefined;
    reimportRef.current = null;
    setAddError(null);
    if (!file) return;
    try {
      // Parsed right here: the file never leaves the browser.
      const text = await file.text();
      const events = parseIcs(text);
      if (!isNeptunCalendar(events, text)) {
        setAddError(NOT_NEPTUN_ERROR);
        return;
      }
      const source = sourceId ? timetableSources.find((s) => s.id === sourceId) : undefined;
      setAddError(timetable.importEvents(events, { sourceId, url: source?.url }));
    } catch {
      setAddError("Nem sikerült beolvasni a fájlt.");
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
    setAddError(null);
    try {
      const events = await fetchFeed(source.url);
      if (!isNeptunCalendar(events)) {
        setAddError(NOT_NEPTUN_ERROR);
        return;
      }
      setAddError(timetable.importEvents(events, { sourceId: source.id, url: source.url }));
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "A naptár nem érhető el");
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
      setEditError("Érvénytelen link");
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
    if (confirm("Biztosan törlöd? A forrásból importált határidők is törlődnek.")) {
      removeFeed(feedId);
    }
  }

  function platformOptions() {
    return (
      <>
        <optgroup label="Beépített">
          {BUILT_IN_PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
        {customPlatforms.length > 0 && (
          <optgroup label="Saját">
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
        <option value={AUTO_COURSE}>Automatikus (kulcsszó alapján)</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </>
    );
  }

  return (
    <section id="naptarak" className="flex flex-col gap-4">
      <SectionHeading
        title="Naptárforrások"
        sub="Canvas- és Moodle-határidők linkről, Neptun-órarend linkről vagy fájlból. A rendszer felismeri, melyik melyik."
        actions={
          feeds.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSyncAll}
              disabled={syncingAll}
            >
              {syncingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Összes frissítése
            </Button>
          ) : undefined
        }
      />

      {(feeds.length > 0 || timetableSources.length > 0) && (
        <ul className="flex flex-col gap-2">
          {feeds.map((feed) => {
            const platform = getPlatform(feed.platformId, customPlatforms);
            const course = feed.courseId ? courses.find((c) => c.id === feed.courseId) : null;
            const isSyncing = syncingIds.has(feed.id);
            const isEditing = editingId === feed.id;
            const pastOpen = pastOpenCount(feed.id);

            if (isEditing) {
              return (
                <li key={feed.id} className="sheet-paper px-4 py-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`feed-edit-name-${feed.id}`}>Név</Label>
                      <Input
                        id={`feed-edit-name-${feed.id}`}
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, name: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`feed-edit-url-${feed.id}`}>URL</Label>
                      <Input
                        id={`feed-edit-url-${feed.id}`}
                        value={editForm.url}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, url: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`feed-edit-platform-${feed.id}`}>Platform</Label>
                      <Select
                        id={`feed-edit-platform-${feed.id}`}
                        value={editForm.platformId}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, platformId: e.target.value }))
                        }
                      >
                        {platformOptions()}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`feed-edit-course-${feed.id}`}>Tárgy</Label>
                      <Select
                        id={`feed-edit-course-${feed.id}`}
                        value={editForm.courseId}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, courseId: e.target.value }))
                        }
                      >
                        {courseOptions()}
                      </Select>
                    </div>
                  </div>
                  {editError && <p className="mt-1 text-xs text-danger">{editError}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                      Mégse
                    </Button>
                    <Button type="button" size="sm" onClick={() => saveEdit(feed.id)}>
                      Mentés
                    </Button>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={feed.id}
                className="sheet-paper flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <PlatformIcon platform={platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-semibold text-heading">{feed.name}</span>
                    <span className="text-[13px] text-muted">
                      {course ? course.name : "Tárgy kulcsszó alapján"} · {deadlineCount(feed.id)} határidő
                    </span>
                  </div>
                  <p className="truncate font-mono text-[11.5px] text-muted-dim" title={feed.url}>
                    {feed.url}
                  </p>
                  <div className="text-[12.5px]">
                    {feed.lastError ? (
                      <span className="text-danger">{feed.lastError}</span>
                    ) : feed.lastSyncedAt ? (
                      <span className="text-muted">
                        Frissítve{" "}
                        {formatDistanceToNow(new Date(feed.lastSyncedAt), {
                          locale: hu,
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted">Még nem frissült</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {(pendingByFeed.get(feed.id) ?? 0) > 0 && (
                    <Button type="button" size="sm" onClick={() => setDiscoveryOpen(true)}>
                      {pendingByFeed.get(feed.id)} új tárgy
                    </Button>
                  )}
                  {pastOpen > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkPastDone(feed.id, pastOpen)}
                    >
                      {pastOpen} lejárt késznek jelölése
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSyncOne(feed.id)}
                    disabled={isSyncing}
                    aria-label="Frissítés"
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <button
                    type="button"
                    aria-label="Szerkesztés"
                    onClick={() => startEdit(feed)}
                    className="rounded-[var(--radius)] p-1.5 text-muted hover:bg-black/[0.06] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Törlés"
                    onClick={() => handleDelete(feed.id)}
                    className="rounded-[var(--radius)] p-1.5 text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
        </ul>
      )}

      <form onSubmit={(e) => void handleAdd(e)} className="sheet-paper p-4 sm:p-5">
        <h3 className="mb-3 text-[15px] font-bold text-heading">Új forrás</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="feed-add-name">Név</Label>
            <Input
              id="feed-add-name"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nem kötelező, pl. Canvas"
            />
          </div>
          <div>
            <Label htmlFor="feed-add-url">Naptárlink</Label>
            <Input
              id="feed-add-url"
              value={addForm.url}
              onChange={(e) => handleAddUrlChange(e.target.value)}
              placeholder="https:// vagy webcal://…"
            />
            {addError && <p className="mt-1 text-xs text-danger">{addError}</p>}
          </div>
          <div>
            <Label htmlFor="feed-add-platform">Platform</Label>
            <Select
              id="feed-add-platform"
              value={addForm.platformId}
              onChange={(e) => {
                setPlatformTouched(true);
                setAddForm((f) => ({ ...f, platformId: e.target.value }));
              }}
            >
              {platformOptions()}
            </Select>
          </div>
          <div>
            <Label htmlFor="feed-add-course">Tárgy</Label>
            <Select
              id="feed-add-course"
              value={addForm.courseId}
              onChange={(e) => setAddForm((f) => ({ ...f, courseId: e.target.value }))}
            >
              {courseOptions()}
            </Select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <label className="flex items-start gap-2 text-[14px] text-foreground">
            <input
              type="checkbox"
              checked={addForm.markPastDone}
              onChange={(e) => setAddForm((f) => ({ ...f, markPastDone: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              A már lejárt határidők legyenek készek
              <span className="block text-[12.5px] text-muted">
                Így a régi feladatok nem jelennek meg lejártként.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={(e) => void handleFile(e)}
              className="sr-only"
              aria-label="Neptun órarend (.ics) kiválasztása"
              tabIndex={-1}
            />
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
              Fájl feltöltése (.ics)
            </Button>
            <Button type="submit" size="sm" disabled={adding || addForm.url.trim().length === 0}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              Hozzáadás
            </Button>
          </div>
        </div>
      </form>

      <div className="px-1 text-[13.5px] text-muted">
        <p className="font-semibold text-heading">Hol találom a naptárlinket?</p>
        <ul className="mt-1.5 space-y-1">
          <li>
            <span className="font-semibold text-foreground">Canvas:</span> Naptár → az oldal alján „Naptár feed”.
          </li>
          <li>
            <span className="font-semibold text-foreground">Moodle:</span> Naptár → Exportálás → „Naptár URL lekérése”.
          </li>
          <li>
            <span className="font-semibold text-foreground">Neptun:</span> Naptár → Exportálás, a letöltött .ics fájlt töltsd fel. Csak az aktuális és a jövőbeli órák kerülnek be; a fájl a böngésződben marad.
          </li>
          <li>
            <span className="font-semibold text-foreground">Más rendszer:</span> ha nincs naptárlink, vedd fel kézzel a határidőket.
          </li>
        </ul>
      </div>
      {timetable.dialogs}
      <DiscoveryDialog open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
    </section>
  );
}
