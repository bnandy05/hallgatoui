"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { BUILT_IN_PLATFORMS, getPlatform } from "@/lib/platforms";
import { linkHost, normalizeLinkUrl } from "@/lib/url";
import type { CourseLink } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PlatformIcon } from "@/components/PlatformIcon";

export interface LinkEditorProps {
  courseId: string;
}

interface LinkFormState {
  platformId: string;
  label: string;
  url: string;
  error: string | null;
}

function emptyForm(defaultPlatformId: string): LinkFormState {
  return { platformId: defaultPlatformId, label: "", url: "", error: null };
}

export function LinkEditor({ courseId }: LinkEditorProps) {
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const customPlatforms = useStore((s) => s.customPlatforms);
  const addLink = useStore((s) => s.addLink);
  const updateLink = useStore((s) => s.updateLink);
  const removeLink = useStore((s) => s.removeLink);
  const moveLink = useStore((s) => s.moveLink);

  const defaultPlatformId = BUILT_IN_PLATFORMS[0].id;
  const [addForm, setAddForm] = useState<LinkFormState>(emptyForm(defaultPlatformId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LinkFormState>(emptyForm(defaultPlatformId));
  // A course without links starts on the form; otherwise it hides behind a dashed slot.
  const [adding, setAdding] = useState(() => (course?.links.length ?? 0) === 0);

  if (!course) return null;

  function handleAdd() {
    const normalized = normalizeLinkUrl(addForm.url);
    if (!normalized) {
      setAddForm((f) => ({ ...f, error: "Érvénytelen link" }));
      return;
    }
    addLink(courseId, {
      platformId: addForm.platformId,
      label: addForm.label.trim() || undefined,
      url: normalized,
    });
    setAddForm(emptyForm(defaultPlatformId));
    setAdding(false);
  }

  function startEdit(link: CourseLink) {
    setEditingId(link.id);
    setEditForm({
      platformId: link.platformId,
      label: link.label ?? "",
      url: link.url,
      error: null,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleSaveEdit(linkId: string) {
    const normalized = normalizeLinkUrl(editForm.url);
    if (!normalized) {
      setEditForm((f) => ({ ...f, error: "Érvénytelen link" }));
      return;
    }
    updateLink(courseId, linkId, {
      platformId: editForm.platformId,
      label: editForm.label.trim() || undefined,
      url: normalized,
    });
    setEditingId(null);
  }

  function handleRemove(linkId: string) {
    if (confirm("Biztosan törlöd?")) {
      removeLink(courseId, linkId);
    }
  }

  const platformOptions = (
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

  const linkFields = (form: LinkFormState, setForm: (u: (f: LinkFormState) => LinkFormState) => void) => (
    <>
      <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Select
          aria-label="Platform"
          value={form.platformId}
          onChange={(e) => setForm((f) => ({ ...f, platformId: e.target.value }))}
        >
          {platformOptions}
        </Select>
        <Input
          aria-label="Felirat"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Felirat (nem kötelező)"
        />
      </div>
      <Input
        aria-label="Link"
        value={form.url}
        onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, error: null }))}
        placeholder="https://…"
        inputMode="url"
      />
      {form.error && <p className="text-[13px] font-semibold text-danger">{form.error}</p>}
    </>
  );

  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-black/[0.05] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex flex-col gap-4">
      {course.links.length > 0 && (
        <ul className="-mx-1 divide-y divide-border/70">
          {course.links.map((link, index) => {
            const platform = getPlatform(link.platformId, customPlatforms);
            const name = link.label || platform.name;

            if (editingId === link.id) {
              return (
                <li key={link.id} className="flex flex-col gap-2 rounded-[var(--radius)] bg-inset p-3">
                  {linkFields(editForm, setEditForm)}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                      Mégse
                    </Button>
                    <Button type="button" size="sm" onClick={() => handleSaveEdit(link.id)}>
                      Mentés
                    </Button>
                  </div>
                </li>
              );
            }

            return (
              <li key={link.id} className="flex items-center gap-3 px-1 py-2">
                <PlatformIcon platform={platform} size="md" />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.url}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <span className="block truncate text-[14.5px] font-semibold text-heading">{name}</span>
                  <span className="block truncate text-[12.5px] text-muted-dim">{linkHost(link.url)}</span>
                </a>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`${name} feljebb`}
                    title="Feljebb"
                    disabled={index === 0}
                    onClick={() => moveLink(courseId, link.id, -1)}
                    className={iconButton}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${name} lejjebb`}
                    title="Lejjebb"
                    disabled={index === course.links.length - 1}
                    onClick={() => moveLink(courseId, link.id, 1)}
                    className={iconButton}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${name} szerkesztése`}
                    title="Szerkesztés"
                    onClick={() => startEdit(link)}
                    className={iconButton}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${name} törlése`}
                    title="Törlés"
                    onClick={() => handleRemove(link.id)}
                    className={`${iconButton} hover:!text-danger`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          className="flex flex-col gap-2 rounded-[var(--radius)] bg-inset p-3"
        >
          <p className="text-[14px] font-bold text-heading">Új link</p>
          {linkFields(addForm, setAddForm)}
          <div className="flex justify-end gap-2">
            {course.links.length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
                Mégse
              </Button>
            )}
            <Button type="submit" size="sm">
              Hozzáadás
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 text-[14px] font-semibold text-muted transition-colors hover:border-accent hover:text-heading"
        >
          <Plus className="h-4 w-4" />
          Új link
        </button>
      )}
    </div>
  );
}
