"use client";

import { useState, type FormEvent } from "react";
import { ClipboardList, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { MAX_REQUIREMENTS_CHARS } from "@/lib/importData";
import { linkHost } from "@/lib/url";
import type { Resource } from "@/lib/types";
import { ResourceForm } from "@/components/ResourceList";
import { RulesPanel } from "@/components/requirements/RulesPanel";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
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

  if (!text && docs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <RulesPanel courseId={course.id} />
        <EmptyState
          icon={ClipboardList}
          title="Még nincs leírás"
          text="Írd le, mi kell a jegyhez (ZH-k, beadandók, hiányzás, pontozás), vagy linkeld a követelményrendszert."
          action={
            <>
              <Button type="button" size="sm" onClick={() => setTextOpen(true)}>
                <Pencil className="h-4 w-4" />
                Követelmények leírása
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditingDoc("new")}>
                <Plus className="h-4 w-4" />
                Dokumentum linkelése
              </Button>
            </>
          }
        />
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RulesPanel courseId={course.id} />
      <div className="sheet-paper flex flex-col gap-3 px-5 py-4">
        {text ? (
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {text}
          </p>
        ) : (
          <p className="text-[14px] text-muted">Még nincs leírás. Írd le röviden, mi kell a jegyhez.</p>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setTextOpen(true)} className="self-start">
          <Pencil className="h-4 w-4" />
          {text ? "Leírás szerkesztése" : "Követelmények leírása"}
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {docs.map((doc) => (
          <li
            key={doc.id}
            className="flex min-w-0 items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-3 py-2"
          >
            <FileText className="h-5 w-5 shrink-0 text-muted" />
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
      <Button type="button" variant="secondary" size="sm" onClick={() => setEditingDoc("new")} className="self-start">
        <Plus className="h-4 w-4" />
        Dokumentum linkelése
      </Button>
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
