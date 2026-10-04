"use client";

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { Wand2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { normalizeLinkUrl } from "@/lib/url";
import { BUILT_IN_PLATFORMS } from "@/lib/platforms";
import { parseQuickDeadline } from "@/lib/quickAdd";
import type { Deadline } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

export interface DeadlineFormValues {
  courseId: string | null;
  title: string;
  due: string; // ISO
  platformId?: string;
  url?: string;
  note?: string;
  critical: boolean;
}

export interface DeadlineFormProps {
  initial?: Deadline;
  defaultCourseId?: string | null;
  initialQuickText?: string;
  onSubmit: (values: DeadlineFormValues) => void;
  onCancel: () => void;
}

const NO_COURSE = "";

function defaultDueLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function toDueInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function toLocalInput(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

export function DeadlineForm({
  initial,
  defaultCourseId,
  initialQuickText,
  onSubmit,
  onCancel,
}: DeadlineFormProps) {
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);

  // Quick text passed in from the command palette is applied once, here.
  const [seed] = useState(() =>
    !initial && initialQuickText
      ? parseQuickDeadline(initialQuickText, useStore.getState().courses, new Date())
      : null
  );
  const [quickText, setQuickText] = useState(initialQuickText ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initial?.title ?? seed?.title ?? "");
  const [courseId, setCourseId] = useState<string>(
    initial ? initial.courseId ?? NO_COURSE : seed?.courseId ?? defaultCourseId ?? NO_COURSE
  );
  const [due, setDue] = useState(
    initial ? toLocalInput(initial.due) : seed?.due ? toDueInput(seed.due) : defaultDueLocal()
  );
  const [platformId, setPlatformId] = useState(initial?.platformId ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [critical, setCritical] = useState(initial?.critical ?? seed?.critical ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(
    () => (quickText.trim() ? parseQuickDeadline(quickText, courses, new Date()) : null),
    [quickText, courses]
  );
  const parsedCourse = parsed?.courseId ? courses.find((c) => c.id === parsed.courseId) : undefined;

  // Fills only the fields the parser found.
  function applyQuick() {
    if (!parsed) return;
    if (parsed.title) setTitle(parsed.title);
    if (parsed.due) setDue(toDueInput(parsed.due));
    if (parsed.courseId) setCourseId(parsed.courseId);
    if (parsed.critical) setCritical(true);
    titleRef.current?.focus();
  }

  function handleQuickKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    applyQuick();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !due) return;

    let normalizedUrl: string | undefined;
    if (url.trim()) {
      const normalized = normalizeLinkUrl(url);
      if (!normalized) {
        setError("Érvénytelen link");
        return;
      }
      normalizedUrl = normalized;
    }

    onSubmit({
      courseId: courseId === NO_COURSE ? null : courseId,
      title: trimmedTitle,
      due: new Date(due).toISOString(),
      platformId: platformId || undefined,
      url: normalizedUrl,
      note: note.trim() || undefined,
      critical,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!initial && (
        <div>
          <Label htmlFor="deadline-quick">Gyors felvétel</Label>
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 shrink-0 text-muted-dim" aria-hidden="true" />
            <Input
              id="deadline-quick"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={handleQuickKeyDown}
              placeholder="Például: ZH jövő kedd 10:00 analízis !"
              autoFocus
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={applyQuick}
              disabled={!parsed}
            >
              Kitöltés
            </Button>
          </div>
          {!parsed && (
            <p className="mt-1.5 text-[12.5px] text-muted">
              Írd be egy sorban, Enterrel kitöltöm a mezőket. A <span className="font-semibold">!</span> kritikusnak jelöli.
            </p>
          )}
          {parsed && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
              {parsed.title && <span className="font-medium text-foreground">{parsed.title}</span>}
              {parsed.due && (
                <span>· {format(parsed.due, "yyyy. MMM d. (EEE) HH:mm", { locale: hu })}</span>
              )}
              {parsedCourse && (
                <span className="inline-flex items-center gap-1">
                  ·
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: parsedCourse.color }}
                  />
                  {parsedCourse.name}
                </span>
              )}
              {parsed.critical && <span className="text-danger">· Kritikus</span>}
            </div>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="deadline-title">Cím</Label>
        <Input
          id="deadline-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus={Boolean(initial)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="deadline-course">Tárgy</Label>
          <Select
            id="deadline-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value={NO_COURSE}>Nincs tárgy</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="deadline-due">Határidő</Label>
          <Input
            id="deadline-due"
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="deadline-platform">Platform</Label>
          <Select
            id="deadline-platform"
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
          >
            <option value="">Nincs platform</option>
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
          </Select>
        </div>
        <div>
          <Label htmlFor="deadline-url">Link</Label>
          <Input
            id="deadline-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
          {error && <p className="mt-1 text-[12.5px] text-danger">{error}</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[14px] font-medium text-foreground">
        <input
          type="checkbox"
          checked={critical}
          onChange={(e) => setCritical(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Kritikus
      </label>

      <div>
        <Label htmlFor="deadline-note">Megjegyzés</Label>
        <Textarea
          id="deadline-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="submit">Mentés</Button>
      </DialogActions>
    </form>
  );
}
