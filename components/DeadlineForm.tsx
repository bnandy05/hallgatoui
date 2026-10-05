"use client";

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { addWeeks, format } from "date-fns";
import { hu } from "date-fns/locale";
import { Plus, Wand2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { normalizeLinkUrl } from "@/lib/url";
import { BUILT_IN_PLATFORMS } from "@/lib/platforms";
import { parseQuickDeadline } from "@/lib/quickAdd";
import { expandDueDates, MAX_SERIES, seriesTitles, wasCapped, type RepeatSpec } from "@/lib/recurrence";
import type { Deadline } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
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
  /** One item when editing or creating a single deadline, several for a series. */
  onSubmit: (values: DeadlineFormValues[]) => void;
  onCancel: () => void;
}

const NO_COURSE = "";

type RepeatMode = "once" | "dates" | "every";
const REPEAT_TABS = [
  { id: "once", label: "Egyszer" },
  { id: "dates", label: "Több időpont" },
  { id: "every", label: "Ismétlődő" },
];

function parseLocal(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

  // Creating only: several dates or a repeat rule. Editing stays a single date.
  const [mode, setMode] = useState<RepeatMode>("once");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [interval, setIntervalValue] = useState("1");
  const [unit, setUnit] = useState<"day" | "week">("week");
  const [endKind, setEndKind] = useState<"count" | "until">("count");
  const [count, setCount] = useState("6");
  const [until, setUntil] = useState("");
  const [numbered, setNumbered] = useState(true);

  const dueDate = parseLocal(due);
  const spec = useMemo<RepeatSpec>(() => {
    if (initial || mode === "once") return { kind: "once" };
    if (mode === "dates") {
      return { kind: "dates", extra: extraDates.map(parseLocal).filter((d): d is Date => d !== null) };
    }
    const untilDate = parseLocal(until);
    return {
      kind: "every",
      interval: Number(interval) || 1,
      unit,
      end: endKind === "count" || !untilDate ? { count: endKind === "count" ? Number(count) || 1 : 1 } : { until: untilDate },
    };
  }, [initial, mode, extraDates, interval, unit, endKind, count, until]);
  const dates = useMemo(() => (dueDate ? expandDueDates(dueDate, spec) : []), [dueDate, spec]);
  const capped = dueDate ? wasCapped(dueDate, spec) : false;
  const previewDates = (() => {
    const f = (d: Date) => format(d, "MMM d.", { locale: hu });
    if (dates.length <= 4) return dates.map(f).join(", ");
    return `${dates.slice(0, 3).map(f).join(", ")}, …, ${f(dates[dates.length - 1])}`;
  })();

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

    const base = {
      courseId: courseId === NO_COURSE ? null : courseId,
      platformId: platformId || undefined,
      url: normalizedUrl,
      note: note.trim() || undefined,
      critical,
    };
    if (initial || dates.length <= 1) {
      const only = dates[0] ?? new Date(due);
      onSubmit([{ ...base, title: trimmedTitle, due: only.toISOString() }]);
      return;
    }
    const titles = numbered ? seriesTitles(trimmedTitle, dates.length) : dates.map(() => trimmedTitle);
    onSubmit(dates.map((d, i) => ({ ...base, title: titles[i], due: d.toISOString() })));
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
              Írd be egy sorban, és Enterre kitöltődnek a mezők. A <span className="font-semibold">!</span> kritikusnak jelöli.
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

      {!initial && (
        <div className="flex flex-col gap-3">
          <Tabs
            label="Ismétlés"
            items={REPEAT_TABS}
            value={mode}
            onChange={(id) => setMode(id as RepeatMode)}
          />
          <TabPanel id="dates" active={mode === "dates"} className="flex flex-col gap-2">
            {extraDates.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  aria-label={`További időpont ${i + 1}`}
                  value={value}
                  onChange={(e) =>
                    setExtraDates((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${i + 1}. további időpont törlése`}
                  onClick={() => setExtraDates((list) => list.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setExtraDates((list) => {
                    const last = parseLocal(list[list.length - 1] ?? due) ?? new Date();
                    return [...list, toDueInput(addWeeks(last, 1))];
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Időpont hozzáadása
              </Button>
            </div>
          </TabPanel>
          <TabPanel id="every" active={mode === "every"} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-foreground">
              <span>Minden</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={52}
                aria-label="Ismétlés gyakorisága"
                value={interval}
                onChange={(e) => setIntervalValue(e.target.value)}
                className="!w-20"
              />
              <Select
                aria-label="Egység"
                value={unit}
                onChange={(e) => setUnit(e.target.value as "day" | "week")}
                className="!w-auto"
              >
                <option value="week">hét</option>
                <option value="day">nap</option>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-foreground">
              <Select
                aria-label="Vége"
                value={endKind}
                onChange={(e) => setEndKind(e.target.value as "count" | "until")}
                className="!w-auto"
              >
                <option value="count">Alkalmak száma</option>
                <option value="until">Eddig</option>
              </Select>
              {endKind === "count" ? (
                <>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_SERIES}
                    aria-label="Alkalmak száma"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="!w-20"
                  />
                  <span>alkalom</span>
                </>
              ) : (
                <Input
                  type="date"
                  aria-label="Utolsó nap"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  required
                  className="!w-auto"
                />
              )}
            </div>
          </TabPanel>
          {dates.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={numbered}
                  onChange={(e) => setNumbered(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Sorszám a cím végére
              </label>
              <p className="text-[12.5px] text-muted" aria-live="polite">
                {dates.length} határidő: {previewDates}
                {capped && ` (legfeljebb ${MAX_SERIES})`}
              </p>
            </div>
          )}
        </div>
      )}

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
