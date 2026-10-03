"use client";

import { useState } from "react";
import { useStore, type SubjectDecision } from "@/lib/store";
import { suggestCourseForSubject, type SubjectInfo } from "@/lib/ical/neptun";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const TARGET_NEW = "__new";
const TARGET_SKIP = "__skip";

export interface TimetableMappingDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subjects: SubjectInfo[];
  /** Earlier choices (subjectKey -> courseId, null = skipped). */
  initial: Record<string, string | null>;
  onConfirm: (decisions: Record<string, SubjectDecision>) => void;
}

export function TimetableMappingDialog(props: TimetableMappingDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.title} size="lg">
      <MappingForm {...props} />
    </Dialog>
  );
}

interface Choice {
  target: string; // TARGET_NEW, TARGET_SKIP or an existing course id
  name: string;
}

function MappingForm({ onClose, subjects, initial, onConfirm }: TimetableMappingDialogProps) {
  const courses = useStore((s) => s.courses);

  // Children mount only while the dialog is open, so initialise from props here.
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      subjects.map((s) => {
        const earlier = initial[s.subjectKey];
        const target =
          earlier !== undefined
            ? (earlier ?? TARGET_SKIP)
            : (suggestCourseForSubject(s.subject, courses) ?? TARGET_NEW);
        return [s.subjectKey, { target, name: s.subject }];
      })
    )
  );

  function patch(key: string, change: Partial<Choice>) {
    setChoices((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
  }

  function handleSave() {
    const decisions: Record<string, SubjectDecision> = {};
    for (const s of subjects) {
      const { target, name } = choices[s.subjectKey];
      decisions[s.subjectKey] =
        target === TARGET_SKIP
          ? { kind: "skip" }
          : target === TARGET_NEW
            ? { kind: "new", name: name.trim() || s.subject }
            : { kind: "existing", courseId: target };
    }
    onConfirm(decisions);
    onClose();
  }

  const newCount = subjects.filter((s) => choices[s.subjectKey]?.target === TARGET_NEW).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        A Neptun gyakran angol tárgynevet ír, kóddal együtt sem, ezért egyszer meg kell mondanod, melyik
        tárgyadhoz tartoznak az órák. A választást a következő importnál is megjegyezzük.
      </p>

      {subjects.length === 0 && <p className="text-sm text-muted">Nincs hozzárendelendő tárgy.</p>}

      <ul className="flex flex-col gap-3">
        {subjects.map((s) => {
          const choice = choices[s.subjectKey];
          if (!choice) return null;
          return (
            <li key={s.subjectKey} className="rounded-md border border-border bg-card p-3">
              <p className="text-sm font-medium text-foreground">{s.subject}</p>
              <p className="mb-2 text-xs text-muted">
                {s.count} óra
                {s.groups.length > 0 && ` · csoport: ${s.groups.join(", ")}`}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  aria-label={`${s.subject}: tárgy`}
                  value={choice.target}
                  onChange={(e) => patch(s.subjectKey, { target: e.target.value })}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={TARGET_NEW}>Új tárgy létrehozása</option>
                  <option value={TARGET_SKIP}>Kihagyás</option>
                </Select>
                {choice.target === TARGET_NEW && (
                  <Input
                    aria-label={`${s.subject}: az új tárgy neve`}
                    value={choice.name}
                    onChange={(e) => patch(s.subjectKey, { name: e.target.value })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button type="button" onClick={handleSave}>
          {newCount > 0 ? `Mentés (${newCount} új tárgy)` : "Mentés"}
        </Button>
      </div>
    </div>
  );
}
