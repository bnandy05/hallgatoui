"use client";

import { useState, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { syncAllFeeds, syncFeed } from "@/lib/ical/client";
import { normalizeLinkUrl } from "@/lib/url";
import { BUILT_IN_PLATFORMS, getPlatform } from "@/lib/platforms";
import type { IcalFeed } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { PlatformIcon } from "@/components/PlatformIcon";

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
}

function emptyForm(): FeedFormValues {
  return { name: "", url: "", platformId: DEFAULT_PLATFORM, courseId: AUTO_COURSE };
}

export function FeedSettings() {
  const feeds = useStore((s) => s.feeds);
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const deadlines = useStore((s) => s.deadlines);
  const addFeed = useStore((s) => s.addFeed);
  const updateFeed = useStore((s) => s.updateFeed);
  const removeFeed = useStore((s) => s.removeFeed);

  const [addForm, setAddForm] = useState<FeedFormValues>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FeedFormValues>(emptyForm());
  const [editError, setEditError] = useState<string | null>(null);

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

  function deadlineCount(feedId: string): number {
    return deadlines.filter((d) => d.feedId === feedId).length;
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

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = addForm.name.trim();
    if (!trimmedName) return;

    const normalizedUrl = normalizeFeedUrl(addForm.url);
    if (!normalizedUrl) {
      setAddError("Érvénytelen link");
      return;
    }

    addFeed({
      name: trimmedName,
      url: normalizedUrl,
      platformId: addForm.platformId,
      courseId: addForm.courseId === AUTO_COURSE ? null : addForm.courseId,
    });
    setAddForm(emptyForm());
    setAddError(null);
  }

  function startEdit(feed: IcalFeed) {
    setEditingId(feed.id);
    setEditForm({
      name: feed.name,
      url: feed.url,
      platformId: feed.platformId,
      courseId: feed.courseId ?? AUTO_COURSE,
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
        <option value={AUTO_COURSE}>Automatikus (kulcsszavak alapján)</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Naptár-források (iCal)</h2>
          <p className="mt-1 text-sm text-muted">
            Canvas és Moodle határidőit iCal feed URL-ből lehet importálni.
          </p>
        </div>
        {feeds.length > 0 && (
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
            Mind szinkronizálása
          </Button>
        )}
      </div>

      {feeds.length > 0 && (
        <ul className="flex flex-col gap-2">
          {feeds.map((feed) => {
            const platform = getPlatform(feed.platformId, customPlatforms);
            const course = feed.courseId ? courses.find((c) => c.id === feed.courseId) : null;
            const isSyncing = syncingIds.has(feed.id);
            const isEditing = editingId === feed.id;

            if (isEditing) {
              return (
                <li key={feed.id} className="rounded-md border border-border px-3 py-3">
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
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <PlatformIcon platform={platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{feed.name}</span>
                    <span className="text-xs text-muted">
                      {course ? course.name : "Automatikus (kulcsszavak alapján)"}
                    </span>
                    <span className="text-xs text-muted">· {deadlineCount(feed.id)} határidő</span>
                  </div>
                  <div className="text-xs">
                    {feed.lastError ? (
                      <span className="text-danger">{feed.lastError}</span>
                    ) : feed.lastSyncedAt ? (
                      <span className="text-muted">
                        Utoljára szinkronizálva{" "}
                        {formatDistanceToNow(new Date(feed.lastSyncedAt), {
                          locale: hu,
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted">Még nem szinkronizált</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSyncOne(feed.id)}
                    disabled={isSyncing}
                    aria-label="Szinkronizálás"
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
                    className="rounded-md p-1.5 text-muted hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Törlés"
                    onClick={() => handleDelete(feed.id)}
                    className="rounded-md p-1.5 text-muted hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="rounded-md border border-dashed border-border p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="feed-add-name">Név</Label>
            <Input
              id="feed-add-name"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="pl. Programozás – Canvas"
            />
          </div>
          <div>
            <Label htmlFor="feed-add-url">Naptár URL</Label>
            <Input
              id="feed-add-url"
              value={addForm.url}
              onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https:// vagy webcal://…"
            />
            {addError && <p className="mt-1 text-xs text-danger">{addError}</p>}
          </div>
          <div>
            <Label htmlFor="feed-add-platform">Platform</Label>
            <Select
              id="feed-add-platform"
              value={addForm.platformId}
              onChange={(e) => setAddForm((f) => ({ ...f, platformId: e.target.value }))}
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
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={addForm.name.trim().length === 0}>
            Hozzáadás
          </Button>
        </div>
      </form>

      <div className="rounded-md border border-border bg-card px-3 py-3 text-sm text-muted">
        <p className="font-medium text-foreground">Hol találom a naptár URL-t?</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            <span className="font-medium text-foreground">Canvas:</span> Naptár → az oldal alján
            a „Naptár feed” link.
          </li>
          <li>
            <span className="font-medium text-foreground">Moodle:</span> Naptár → Exportálás →
            „Naptár URL lekérése”.
          </li>
          <li>
            <span className="font-medium text-foreground">TMS / egyéb:</span> ha nincs iCal
            feed, vedd fel kézzel a határidőket.
          </li>
        </ul>
      </div>
    </section>
  );
}
