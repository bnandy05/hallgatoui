"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { linkHost, normalizeLinkUrl } from "@/lib/url";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { formatRelative } from "@/lib/radar";
import type { Resource, ResourceKind } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
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
  const t = useT();
  const locale = useLocale();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const addResource = useStore((s) => s.addResource);
  const updateResource = useStore((s) => s.updateResource);
  const removeResource = useStore((s) => s.removeResource);

  const [filter, setFilter] = useState<ResourceKind | "all">("all");
  // null: closed; "new": adding; otherwise the id of the resource being edited.
  const [editing, setEditing] = useState<string | null>(null);

  if (!course) return null;

  const editingResource = course.resources.find((r) => r.id === editing);

  function handleSubmit(values: Omit<Resource, "id" | "createdAt">) {
    if (!course) return;
    if (editingResource) updateResource(course.id, editingResource.id, values);
    else addResource(course.id, values);
    setEditing(null);
  }

  function handleRemove(resource: Resource) {
    if (!course) return;
    if (confirm(t.linkEditor.confirmDelete)) {
      removeResource(course.id, resource.id);
    }
  }

  const sorted = [...course.resources].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const kindsInUse = KINDS.filter((kind) => course.resources.some((r) => r.kind === kind));
  const activeFilter = filter !== "all" && kindsInUse.includes(filter) ? filter : "all";
  const filtered = activeFilter === "all" ? sorted : sorted.filter((r) => r.kind === activeFilter);

  const dialog = (
    <Dialog
      open={editing !== null}
      onClose={() => setEditing(null)}
      title={editingResource ? t.resources.editTitle : t.resources.newTitle}
    >
      <ResourceForm
        initial={editingResource}
        onSubmit={handleSubmit}
        onCancel={() => setEditing(null)}
      />
    </Dialog>
  );

  if (course.resources.length === 0) {
    return (
      <>
        <EmptyState
          icon={BookOpen}
          title={t.resources.none}
          text={t.resources.noneText}
          action={
            <Button type="button" size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              {t.resources.add}
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
          aria-label={t.resources.type}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <FilterChip active={activeFilter === "all"} onClick={() => setFilter("all")} label={t.resources.all} count={course.resources.length} />
          {kindsInUse.map((kind) => (
            <FilterChip
              key={kind}
              active={activeFilter === kind}
              onClick={() => setFilter(kind)}
              label={t.resourceKinds[kind]}
              count={course.resources.filter((r) => r.kind === kind).length}
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
            <p className="text-fine font-semibold text-muted-dim">{t.resourceKinds[resource.kind]}</p>
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              title={resource.url}
              className="mt-0.5 line-clamp-2 text-body font-semibold leading-snug text-heading [overflow-wrap:anywhere] hover:underline"
            >
              {resource.title}
            </a>
            {resource.note && <p className="mt-1 line-clamp-3 text-small text-muted">{resource.note}</p>}
            <div className="mt-auto flex items-center gap-1 pt-2">
              <span className="min-w-0 flex-1 truncate text-fine text-muted-dim">
                {linkHost(resource.url)} ·{" "}
                {formatRelative(new Date(resource.createdAt), new Date(), locale)}
              </span>
              <IconButton
                aria-label={t.resources.editAria(resource.title)}
                title={t.common.edit}
                onClick={() => setEditing(resource.id)}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                tone="danger"
                aria-label={t.resources.deleteAria(resource.title)}
                title={t.common.delete}
                onClick={() => handleRemove(resource)}
                className="-mr-1.5"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex h-full min-h-[7.5rem] w-full items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 text-body font-semibold text-muted transition-colors hover:border-accent hover:text-heading"
          >
            <Plus className="h-4 w-4" />
            {t.resources.add}
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
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
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
  onSubmit: (values: Omit<Resource, "id" | "createdAt">) => void;
  onCancel: () => void;
}

function ResourceForm({ initial, onSubmit, onCancel }: ResourceFormProps) {
  const t = useT();
  const [form, setForm] = useState<ResourceFormState>(() => (initial ? fromResource(initial) : emptyForm()));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const url = normalizeLinkUrl(form.url);
    if (!url) {
      setForm((f) => ({ ...f, error: t.linkEditor.invalidLink }));
      return;
    }
    onSubmit({ title, url, kind: form.kind, note: form.note.trim() || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div>
          <Label htmlFor="resource-title">{t.resources.title}</Label>
          <Input
            id="resource-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="resource-kind">{t.resources.type}</Label>
          <Select
            id="resource-kind"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ResourceKind }))}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t.resourceKinds[kind]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="resource-url">{t.linkEditor.link}</Label>
        <Input
          id="resource-url"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, error: null }))}
          placeholder="https://…"
          inputMode="url"
        />
        {form.error && <p className="mt-1 text-small font-semibold text-danger">{form.error}</p>}
      </div>

      <div>
        <Label htmlFor="resource-note">{t.deadlineDetail.note}</Label>
        <Textarea
          id="resource-note"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          rows={2}
        />
      </div>

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit">{initial ? t.common.save : t.linkEditor.add}</Button>
      </DialogActions>
    </form>
  );
}
