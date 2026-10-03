"use client";

import { useState, type FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { normalizeLinkUrl } from "@/lib/url";
import { RESOURCE_KIND_COLORS, RESOURCE_KIND_LABELS } from "@/lib/platforms";
import type { Resource, ResourceKind } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<ResourceFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ResourceFormState>(emptyForm());

  if (!course) return null;

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!course) return;
    const title = addForm.title.trim();
    if (!title) return;
    const normalized = normalizeLinkUrl(addForm.url);
    if (!normalized) {
      setAddForm((f) => ({ ...f, error: "Érvénytelen link" }));
      return;
    }
    addResource(course.id, {
      title,
      url: normalized,
      kind: addForm.kind,
      note: addForm.note.trim() || undefined,
    });
    setAddForm(emptyForm());
    setAddOpen(false);
  }

  function startEdit(resource: Resource) {
    setEditingId(resource.id);
    setEditForm(fromResource(resource));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>, resourceId: string) {
    event.preventDefault();
    if (!course) return;
    const title = editForm.title.trim();
    if (!title) return;
    const normalized = normalizeLinkUrl(editForm.url);
    if (!normalized) {
      setEditForm((f) => ({ ...f, error: "Érvénytelen link" }));
      return;
    }
    updateResource(course.id, resourceId, {
      title,
      url: normalized,
      kind: editForm.kind,
      note: editForm.note.trim() || undefined,
    });
    setEditingId(null);
  }

  function handleRemove(resourceId: string) {
    if (!course) return;
    if (confirm("Biztosan törlöd?")) {
      removeResource(course.id, resourceId);
    }
  }

  if (course.resources.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={BookOpen}
          title="Még nincs anyag"
          text="Gyűjtsd ide a jegyzeteket, a korábbi ZH-kat és a mintamegoldásokat."
          action={
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Anyag hozzáadása
            </Button>
          }
        />
        {addOpen && (
          <ResourceForm
            form={addForm}
            setForm={setAddForm}
            onSubmit={handleAdd}
            onCancel={() => {
              setAddOpen(false);
              setAddForm(emptyForm());
            }}
          />
        )}
      </div>
    );
  }

  const sorted = [...course.resources].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  const filtered = filter === "all" ? sorted : sorted.filter((r) => r.kind === filter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label={`Mind (${course.resources.length})`}
          />
          {KINDS.map((kind) => (
            <FilterChip
              key={kind}
              active={filter === kind}
              onClick={() => setFilter(kind)}
              label={`${RESOURCE_KIND_LABELS[kind]} (${
                course.resources.filter((r) => r.kind === kind).length
              })`}
            />
          ))}
        </div>
        <Button
          type="button"
          variant={addOpen ? "secondary" : "primary"}
          size="sm"
          onClick={() => setAddOpen((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          Anyag hozzáadása
        </Button>
      </div>

      {addOpen && (
        <ResourceForm
          form={addForm}
          setForm={setAddForm}
          onSubmit={handleAdd}
          onCancel={() => {
            setAddOpen(false);
            setAddForm(emptyForm());
          }}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Nincs ilyen típusú anyag.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((resource) => {
            if (editingId === resource.id) {
              return (
                <li key={resource.id}>
                  <ResourceForm
                    form={editForm}
                    setForm={setEditForm}
                    onSubmit={(e) => handleSaveEdit(e, resource.id)}
                    onCancel={cancelEdit}
                    submitLabel="Mentés"
                  />
                </li>
              );
            }

            return (
              <li
                key={resource.id}
                className="flex flex-col gap-1 rounded-[var(--radius-slip)] bg-card px-3.5 py-2.5 shadow-[var(--shadow-paper)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={RESOURCE_KIND_COLORS[resource.kind]}>
                    {RESOURCE_KIND_LABELS[resource.kind]}
                  </Badge>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={resource.url}
                    className="truncate text-sm font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {resource.title}
                  </a>
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {formatDistanceToNow(new Date(resource.createdAt), {
                      locale: hu,
                      addSuffix: true,
                    })}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="Szerkesztés"
                      onClick={() => startEdit(resource)}
                      className="rounded-[var(--radius)] p-1 text-muted hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Törlés"
                      onClick={() => handleRemove(resource.id)}
                      className="rounded-[var(--radius)] p-1 text-muted hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {resource.note && <p className="text-sm text-muted">{resource.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function FilterChip({ active, onClick, label }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        active
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-card text-muted hover:border-border-strong hover:text-heading"
      }`}
    >
      {label}
    </button>
  );
}

interface ResourceFormProps {
  form: ResourceFormState;
  setForm: (updater: (f: ResourceFormState) => ResourceFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitLabel?: string;
}

function ResourceForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel = "Hozzáadás",
}: ResourceFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="sheet-paper flex flex-col gap-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="resource-title">Cím</Label>
          <Input
            id="resource-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="resource-kind">Típus</Label>
          <Select
            id="resource-kind"
            value={form.kind}
            onChange={(e) =>
              setForm((f) => ({ ...f, kind: e.target.value as ResourceKind }))
            }
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {RESOURCE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="resource-url">URL</Label>
        <Input
          id="resource-url"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="https://…"
        />
        {form.error && <p className="mt-1 text-xs text-danger">{form.error}</p>}
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
