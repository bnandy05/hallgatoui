"use client";

import { useState, type FormEvent } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { MAX_REQUIREMENTS_CHARS } from "@/lib/importData";
import { linkHost } from "@/lib/url";
import type { Resource } from "@/lib/types";
import { ResourceForm } from "@/components/ResourceList";
import { RulesPanel } from "@/components/requirements/RulesPanel";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/**
 * The course's requirements in one place: the rules as free text and links to the
 * requirement documents (resources of kind "kovetelmeny", kept out of "Anyagok").
 */
export function RequirementsSection({ courseId }: { courseId: string }) {
  const tAll = useT();
  const t = tAll.requirementsSection;
  const { confirm: ask, dialog: confirmDialog } = useConfirm();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const updateCourse = useStore((s) => s.updateCourse);
  const addResource = useStore((s) => s.addResource);
  const updateResource = useStore((s) => s.updateResource);
  const removeResource = useStore((s) => s.removeResource);

  const [textOpen, setTextOpen] = useState(false);
  // null: closed; "new": adding; otherwise the id of the document being edited.
  const [editingDoc, setEditingDoc] = useState<string | null>(null);

  if (!course) return null;

  const docs = course.resources
    .filter((r) => r.kind === "kovetelmeny")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const editing = docs.find((r) => r.id === editingDoc);
  const text = course.requirements?.trim() ?? "";

  function saveDoc(values: Omit<Resource, "id" | "createdAt">) {
    if (!course) return;
    if (editing) updateResource(course.id, editing.id, values);
    else addResource(course.id, values);
    setEditingDoc(null);
  }

  async function removeDoc(doc: Resource) {
    if (!course) return;
    if (await ask({ title: t.removeDocTitle, confirmLabel: tAll.common.delete })) removeResource(course.id, doc.id);
  }

  const dialogs = (
    <>
      <Dialog open={textOpen} onClose={() => setTextOpen(false)} title={t.textTitle}>
        <RequirementsForm
          initial={course.requirements ?? ""}
          onSubmit={(value) => {
            updateCourse(course.id, { requirements: value || undefined });
            setTextOpen(false);
          }}
          onCancel={() => setTextOpen(false)}
        />
      </Dialog>
      <Dialog
        open={editingDoc !== null}
        onClose={() => setEditingDoc(null)}
        title={editing ? t.editDoc : t.newDoc}
      >
        <ResourceForm initial={editing} fixedKind="kovetelmeny" onSubmit={saveDoc} onCancel={() => setEditingDoc(null)} />
      </Dialog>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <RulesPanel courseId={course.id} />
      <div className="sheet-paper px-5 py-4 sm:px-6">
        <h3 className="font-display text-subhead text-heading">{t.heading}</h3>
        {text ? (
          <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-body leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {text}
          </p>
        ) : (
          docs.length === 0 && (
            <p className="mt-1 text-small text-muted">{t.emptyHint}</p>
          )
        )}

        {docs.length > 0 && (
          <ul className={`flex flex-col ${text ? "mt-3 border-t border-border" : "mt-2"}`}>
            {docs.map((doc) => (
              <li key={doc.id} className="flex min-w-0 items-center gap-3 border-b border-border py-2.5">
                <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={doc.url}
                    className="block truncate text-body font-semibold text-heading hover:underline"
                  >
                    {doc.title}
                  </a>
                  <span className="block truncate text-fine text-muted-dim">
                    {doc.note ? `${doc.note} · ` : ""}
                    {linkHost(doc.url)}
                  </span>
                </span>
                <IconButton aria-label={t.editDocLabel(doc.title)} title={tAll.common.edit} onClick={() => setEditingDoc(doc.id)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton
                  tone="danger"
                  aria-label={t.removeDocLabel(doc.title)}
                  title={tAll.common.delete}
                  onClick={() => removeDoc(doc)}
                  className="-mr-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <div className="-ml-3 mt-2 flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setTextOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {text ? t.editText : t.writeText}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditingDoc("new")}>
            <Plus className="h-4 w-4" aria-hidden />
            {t.linkDoc}
          </Button>
        </div>
      </div>
      {dialogs}
      {confirmDialog}
    </div>
  );
}

function RequirementsForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const tAll = useT();
  const t = tAll.requirementsSection;
  const locale = useLocale();
  const [value, setValue] = useState(initial);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="requirements-text">{t.formLabel}</Label>
        <Textarea
          id="requirements-text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={12}
          maxLength={MAX_REQUIREMENTS_CHARS}
          placeholder={t.formPlaceholder}
        />
        <p className="mt-1 text-fine tabular-nums text-muted-dim">
          {t.chars(value.length.toLocaleString(locale === "hu" ? "hu-HU" : "en-GB"), MAX_REQUIREMENTS_CHARS.toLocaleString(locale === "hu" ? "hu-HU" : "en-GB"))}
        </p>
      </div>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tAll.common.cancel}
        </Button>
        <Button type="submit">{tAll.common.save}</Button>
      </DialogActions>
    </form>
  );
}
