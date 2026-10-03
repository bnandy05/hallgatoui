"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { BUILT_IN_PLATFORMS, getPlatform } from "@/lib/platforms";
import { normalizeLinkUrl } from "@/lib/url";
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

  return (
    <div className="flex flex-col gap-3">
      {course.links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {course.links.map((link, index) => {
            const platform = getPlatform(link.platformId, customPlatforms);
            const isEditing = editingId === link.id;

            if (isEditing) {
              return (
                <li key={link.id} className="sheet-paper p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <Select
                      value={editForm.platformId}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, platformId: e.target.value }))
                      }
                      className="sm:w-40"
                    >
                      {platformOptions}
                    </Select>
                    <Input
                      value={editForm.label}
                      onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Felirat (nem kötelező)"
                      className="sm:w-40"
                    />
                    <Input
                      value={editForm.url}
                      onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                      placeholder="https://…"
                    />
                  </div>
                  {editForm.error && (
                    <p className="mt-1 text-xs text-danger">{editForm.error}</p>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
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
              <li
                key={link.id}
                className="flex items-center gap-2.5 rounded-[var(--radius-slip)] bg-card px-3.5 py-2.5 shadow-[var(--shadow-paper)]"
              >
                <PlatformIcon platform={platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {link.label || platform.name}
                  </p>
                  <p className="truncate text-xs text-muted" title={link.url}>
                    {link.url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Feljebb"
                    disabled={index === 0}
                    onClick={() => moveLink(courseId, link.id, -1)}
                    className="rounded-[var(--radius)] p-1 text-muted hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Lejjebb"
                    disabled={index === course.links.length - 1}
                    onClick={() => moveLink(courseId, link.id, 1)}
                    className="rounded-[var(--radius)] p-1 text-muted hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Szerkesztés"
                    onClick={() => startEdit(link)}
                    className="rounded-[var(--radius)] p-1 text-muted hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Törlés"
                    onClick={() => handleRemove(link.id)}
                    className="rounded-[var(--radius)] p-1 text-muted hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sheet-paper p-4">
        <p className="mb-2.5 text-[14px] font-bold text-heading">Új link</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Select
            value={addForm.platformId}
            onChange={(e) => setAddForm((f) => ({ ...f, platformId: e.target.value }))}
            className="sm:w-40"
          >
            {platformOptions}
          </Select>
          <Input
            value={addForm.label}
            onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Felirat (nem kötelező)"
            className="sm:w-40"
          />
          <Input
            value={addForm.url}
            onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://…"
          />
        </div>
        {addForm.error && <p className="mt-1 text-xs text-danger">{addForm.error}</p>}
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" onClick={handleAdd}>
            Hozzáadás
          </Button>
        </div>
      </div>
    </div>
  );
}
