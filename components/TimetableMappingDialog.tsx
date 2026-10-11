"use client";

import { useState } from "react";
import { useStore, type SubjectDecision } from "@/lib/store";
import { suggestCourseForSubject, type SubjectInfo } from "@/lib/ical/neptun";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
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
  const t = useT();
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
      <p className="text-body text-muted">
        {t.mapping.intro}
      </p>

      {subjects.length === 0 && <p className="text-body text-muted">{t.mapping.none}</p>}

      <ul className="-mx-5 divide-y divide-border/70 border-y border-border/70">
        {subjects.map((s) => {
          const choice = choices[s.subjectKey];
          if (!choice) return null;
          return (
            <li key={s.subjectKey} className="px-5 py-4">
              <p className="text-body font-medium text-foreground">{s.subject}</p>
              <p className="mb-2 text-fine text-muted">
                {t.mapping.classCount(s.count)}
                {s.groups.length > 0 && t.mapping.groups(s.groups.join(", "))}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  aria-label={t.mapping.courseOf(s.subject)}
                  value={choice.target}
                  onChange={(e) => patch(s.subjectKey, { target: e.target.value })}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={TARGET_NEW}>{t.mapping.createNew}</option>
                  <option value={TARGET_SKIP}>{t.mapping.skip}</option>
                </Select>
                {choice.target === TARGET_NEW && (
                  <Input
                    aria-label={t.mapping.newNameOf(s.subject)}
                    value={choice.name}
                    onChange={(e) => patch(s.subjectKey, { name: e.target.value })}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="button" onClick={handleSave}>
          {newCount > 0 ? t.mapping.saveWithNew(newCount) : t.common.save}
        </Button>
      </DialogActions>
    </div>
  );
}
