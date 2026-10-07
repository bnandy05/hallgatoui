"use client";

import { useState, type FormEvent } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { MAX_REQUIREMENTS_CHARS } from "@/lib/importData";
import { linkHost } from "@/lib/url";
import type { Resource } from "@/lib/types";
import { ResourceForm } from "@/components/ResourceList";
import { RulesPanel } from "@/components/requirements/RulesPanel";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";

/**
 * The course's requirements in one place: the rules as free text and links to the
 * requirement documents (resources of kind "kovetelmeny", kept out of "Anyagok").
 */
export function RequirementsSection({ courseId }: { courseId: string }) {
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

  function removeDoc(doc: Resource) {
    if (!course) return;
    if (confirm("Biztosan törlöd a dokumentumot?")) removeResource(course.id, doc.id);
  }

  const dialogs = (
    <>
      <Dialog open={textOpen} onClose={() => setTextOpen(false)} title="Követelmények">
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
        title={editing ? "Dokumentum szerkesztése" : "Követelmény-dokumentum"}
      >
        <ResourceForm initial={editing} fixedKind="kovetelmeny" onSubmit={saveDoc} onCancel={() => setEditingDoc(null)} />
      </Dialog>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <RulesPanel courseId={course.id} />
      <div className="sheet-paper px-5 py-4 sm:px-6">
        <h3 className="font-display text-[22px] text-heading">Leírás és dokumentumok</h3>
        {text ? (
          <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {text}
          </p>
        ) : (
          docs.length === 0 && (
            <p className="mt-1 text-[13.5px] text-muted">
              Jegyezd fel röviden, mi kell a jegyhez, és linkeld a hivatalos követelményrendszert.
            </p>
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
                    className="block truncate text-[14px] font-semibold text-heading hover:underline"
                  >
                    {doc.title}
                  </a>
                  <span className="block truncate text-[12px] text-muted-dim">
                    {doc.note ? `${doc.note} · ` : ""}
                    {linkHost(doc.url)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`${doc.title} szerkesztése`}
                  title="Szerkesztés"
                  onClick={() => setEditingDoc(doc.id)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${doc.title} törlése`}
                  title="Törlés"
                  onClick={() => removeDoc(doc)}
                  className="-mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="-ml-3 mt-2 flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setTextOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            {text ? "Leírás szerkesztése" : "Leírás írása"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditingDoc("new")}>
            <Plus className="h-4 w-4" aria-hidden />
            Dokumentum linkelése
          </Button>
        </div>
      </div>
      {dialogs}
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
  const [value, setValue] = useState(initial);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="requirements-text">Mi kell a jegyhez?</Label>
        <Textarea
          id="requirements-text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={12}
          maxLength={MAX_REQUIREMENTS_CHARS}
          placeholder={"Pl. 2 ZH, egyenként legalább 40%\nLegfeljebb 3 hiányzás\nPótZH: a rosszabbat váltja ki"}
        />
        <p className="mt-1 text-[12.5px] tabular-nums text-muted-dim">
          {value.length.toLocaleString("hu-HU")} / {MAX_REQUIREMENTS_CHARS.toLocaleString("hu-HU")} karakter
        </p>
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
