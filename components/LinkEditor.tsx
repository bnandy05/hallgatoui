"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { BUILT_IN_PLATFORMS, getPlatform, platformName } from "@/lib/platforms";
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
  const t = useT();
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
      setAddForm((f) => ({ ...f, error: t.linkEditor.invalidLink }));
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
      setEditForm((f) => ({ ...f, error: t.linkEditor.invalidLink }));
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
    if (confirm(t.linkEditor.confirmDelete)) {
      removeLink(courseId, linkId);
    }
  }

  const platformOptions = (
    <>
      <optgroup label={t.linkEditor.builtIn}>
        {BUILT_IN_PLATFORMS.map((p) => (
          <option key={p.id} value={p.id}>
            {platformName(p, t.platforms.other)}
          </option>
        ))}
      </optgroup>
      {customPlatforms.length > 0 && (
        <optgroup label={t.linkEditor.custom}>
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
          aria-label={t.linkEditor.platform}
          value={form.platformId}
          onChange={(e) => setForm((f) => ({ ...f, platformId: e.target.value }))}
        >
          {platformOptions}
        </Select>
        <Input
          aria-label={t.linkEditor.label}
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder={t.linkEditor.labelPlaceholder}
        />
      </div>
      <Input
        aria-label={t.linkEditor.link}
        value={form.url}
        onChange={(e) => setForm((f) => ({ ...f, url: e.target.value, error: null }))}
        placeholder="https://…"
        inputMode="url"
      />
      {form.error && <p className="text-small font-semibold text-danger">{form.error}</p>}
    </>
  );

  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex flex-col gap-4">
      {course.links.length > 0 && (
        <ul className="-mx-1 divide-y divide-border/70">
          {course.links.map((link, index) => {
            const platform = getPlatform(link.platformId, customPlatforms);
            const name = link.label || platformName(platform, t.platforms.other);

            if (editingId === link.id) {
              return (
                <li key={link.id} className="flex flex-col gap-2 rounded-[var(--radius)] bg-inset p-3">
                  {linkFields(editForm, setEditForm)}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                      {t.common.cancel}
                    </Button>
                    <Button type="button" size="sm" onClick={() => handleSaveEdit(link.id)}>
                      {t.common.save}
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
                  <span className="block truncate text-body font-semibold text-heading">{name}</span>
                  <span className="block truncate text-fine text-muted-dim">{linkHost(link.url)}</span>
                </a>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={t.linkEditor.moveUpAria(name)}
                    title={t.linkEditor.moveUp}
                    disabled={index === 0}
                    onClick={() => moveLink(courseId, link.id, -1)}
                    className={iconButton}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.linkEditor.moveDownAria(name)}
                    title={t.linkEditor.moveDown}
                    disabled={index === course.links.length - 1}
                    onClick={() => moveLink(courseId, link.id, 1)}
                    className={iconButton}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.linkEditor.editAria(name)}
                    title={t.common.edit}
                    onClick={() => startEdit(link)}
                    className={iconButton}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.linkEditor.deleteAria(name)}
                    title={t.common.delete}
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
          <p className="text-body font-bold text-heading">{t.linkEditor.newLink}</p>
          {linkFields(addForm, setAddForm)}
          <div className="flex justify-end gap-2">
            {course.links.length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
                {t.common.cancel}
              </Button>
            )}
            <Button type="submit" size="sm">
              {t.linkEditor.add}
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 text-body font-semibold text-muted transition-colors hover:border-accent hover:text-heading"
        >
          <Plus className="h-4 w-4" />
          {t.linkEditor.newLink}
        </button>
      )}
    </div>
  );
}
