"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { linkHost, normalizeLinkUrl } from "@/lib/url";
import { RESOURCE_KIND_LABELS } from "@/lib/platforms";
import type { Resource, ResourceKind } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

export interface ResourceListProps {
  courseId: string;
}

const KINDS: ResourceKind[] = ["jegyzet", "zh", "megoldas", "video", "egyeb"];

interface ResourceFormState {
  title: string;
  url: string;
  kind: ResourceKind;
  note: string;
  error: string | null;
}

function emptyForm(): ResourceFormState {
  return { title: "", url: "", kind: "jegyzet", note: "", error: null };
}

function fromResource(resource: Resource): ResourceFormState {
  return {
    title: resource.title,
    url: resource.url,
    kind: resource.kind,
    note: resource.note ?? "",
    error: null,
  };
}

export function ResourceList({ courseId }: ResourceListProps) {
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const addResource = useStore((s) => s.addResource);
  const updateResource = useStore((s) => s.updateResource);
  const removeResource = useStore((s) => s.removeResource);

  const [filter, setFilter] = useState<ResourceKind | "all">("all");
  // null: closed; "new": adding; otherwise the id of the resource being edited.
  const [editing, setEditing] = useState<string | null>(null);

  if (!course) return null;

  // Requirement documents live in the course's "Követelmények" section.
  const resources = course.resources.filter((r) => r.kind !== "kovetelmeny");
  const editingResource = resources.find((r) => r.id === editing);

  function handleSubmit(values: Omit<Resource, "id" | "createdAt">) {
    if (!course) return;
    if (editingResource) updateResource(course.id, editingResource.id, values);
    else addResource(course.id, values);
    setEditing(null);
  }

  function handleRemove(resource: Resource) {
    if (!course) return;
    if (confirm("Biztosan törlöd?")) {
      removeResource(course.id, resource.id);
    }
  }

  const sorted = [...resources].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const kindsInUse = KINDS.filter((kind) => resources.some((r) => r.kind === kind));
  const activeFilter = filter !== "all" && kindsInUse.includes(filter) ? filter : "all";
  const filtered = activeFilter === "all" ? sorted : sorted.filter((r) => r.kind === activeFilter);

  const dialog = (
    <Dialog
      open={editing !== null}
      onClose={() => setEditing(null)}
      title={editingResource ? "Anyag szerkesztése" : "Új anyag"}
    >
      <ResourceForm
        initial={editingResource}
        onSubmit={handleSubmit}
        onCancel={() => setEditing(null)}
      />
    </Dialog>
  );

  if (resources.length === 0) {
    return (
      <>
        <EmptyState
          icon={BookOpen}
          title="Még nincs anyag"
          text="Gyűjtsd ide a jegyzeteket, a korábbi ZH-kat és a mintamegoldásokat."
          action={
            <Button type="button" size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              Anyag hozzáadása
            </Button>
          }
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {kindsInUse.length > 1 && (
        <div
          role="group"
          aria-label="Típus"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <FilterChip active={activeFilter === "all"} onClick={() => setFilter("all")} label="Mind" count={resources.length} />
          {kindsInUse.map((kind) => (
            <FilterChip
              key={kind}
              active={activeFilter === kind}
              onClick={() => setFilter(kind)}
              label={RESOURCE_KIND_LABELS[kind]}
              count={resources.filter((r) => r.kind === kind).length}
            />
          ))}
        </div>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-4 gap-y-5">
        {filtered.map((resource, i) => (
          <li
            key={resource.id}
            className="slip flex min-w-0 flex-col bg-card px-4 pb-2 pt-4"
            style={{ "--i": i } as CSSProperties}
          >
            <span
              aria-hidden="true"
              className="pin -top-[4px] left-4"
              style={{ "--pin-color": "var(--pin-neutral)" } as CSSProperties}
            />
            <p className="text-[12px] font-semibold text-muted-dim">{RESOURCE_KIND_LABELS[resource.kind]}</p>
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              title={resource.url}
              className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-heading [overflow-wrap:anywhere] hover:underline"
            >
              {resource.title}
            </a>
            {resource.note && <p className="mt-1 line-clamp-3 text-[13.5px] text-muted">{resource.note}</p>}
            <div className="mt-auto flex items-center gap-1 pt-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-dim">
                {linkHost(resource.url)} ·{" "}
                {formatDistanceToNow(new Date(resource.createdAt), { locale: hu, addSuffix: true })}
              </span>
              <button
                type="button"
                aria-label={`${resource.title} szerkesztése`}
                title="Szerkesztés"
                onClick={() => setEditing(resource.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`${resource.title} törlése`}
                title="Törlés"
                onClick={() => handleRemove(resource)}
                className="-mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex h-full min-h-[7.5rem] w-full items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 text-[14px] font-semibold text-muted transition-colors hover:border-accent hover:text-heading"
          >
            <Plus className="h-4 w-4" />
            Anyag hozzáadása
          </button>
        </li>
      </ul>
      {dialog}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        active
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-card text-muted hover:border-border-strong hover:text-heading"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "text-accent-ink/70" : "text-muted-dim"}`}>{count}</span>
    </button>
  );
}

interface ResourceFormProps {
  initial?: Resource;
  /** Hides the type picker and saves every resource with this kind. */
  fixedKind?: ResourceKind;
  onSubmit: (values: Omit<Resource, "id" | "createdAt">) => void;
  onCancel: () => void;
}

export function ResourceForm({ initial, fixedKind, onSubmit, onCancel }: ResourceFormProps) {
  const [form, setForm] = useState<ResourceFormState>(() =>
    initial ? fromResource(initial) : { ...emptyForm(), kind: fixedKind ?? "jegyzet" }
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const url = normalizeLinkUrl(form.url);
    if (!url) {
      setForm((f) => ({ ...f, error: "Érvénytelen link" }));
      return;
    }
    onSubmit({ title, url, kind: fixedKind ?? form.kind, note: form.note.trim() || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className={fixedKind ? "" : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]"}>
        <div>
          <Label htmlFor="resource-title">Cím</Label>
          <Input
            id="resource-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>
        {!fixedKind && (
          <div>
            <Label htmlFor="resource-kind">Típus</Label>
            <Select
              id="resource-kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ResourceKind }))}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {RESOURCE_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="resource-url">Link</Label>
        <Input
          id="resource-url"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, error: null }))}
          placeholder="https://…"
          inputMode="url"
        />
        {form.error && <p className="mt-1 text-[13px] font-semibold text-danger">{form.error}</p>}
      </div>

      <div>
        <Label htmlFor="resource-note">Megjegyzés</Label>
        <Textarea
          id="resource-note"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          rows={2}
        />
      </div>

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="submit">{initial ? "Mentés" : "Hozzáadás"}</Button>
      </DialogActions>
    </form>
  );
}
