"use client";

import { useState } from "react";
import { useStore, type SubjectDecision } from "@/lib/store";
import { groupMappingKey, isSplitByGroup, type SubjectInfo } from "@/lib/ical/neptun";
import { useCourseSuggestions } from "@/lib/suggest/useCourseSuggestions";
import { SuggestionNote } from "@/components/SuggestionNote";
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
  /** Earlier choices (subjectKey or subjectKey|group -> courseId, null = skipped). */
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

interface SubjectChoice {
  /** Each Neptun group is its own course (Ea and Gy are graded separately at ELTE). */
  split: boolean;
  whole: Choice;
  groups: Record<string, Choice>;
}

function decisionOf({ target, name }: Choice, fallback: string): SubjectDecision {
  if (target === TARGET_SKIP) return { kind: "skip" };
  if (target === TARGET_NEW) return { kind: "new", name: name.trim() || fallback };
  return { kind: "existing", courseId: target };
}

function MappingForm({ onClose, subjects, initial, onConfirm }: TimetableMappingDialogProps) {
  const courses = useStore((s) => s.courses);
  // Subjects without an earlier choice get a suggestion: local matching at once, Jev for the rest.
  const fresh = (s: SubjectInfo) => initial[s.subjectKey] === undefined && !isSplitByGroup(initial, s.subjectKey);
  const { suggestions, asking } = useCourseSuggestions(subjects.filter(fresh).map((s) => s.subject), courses);
  const suggestedCourse = (s: SubjectInfo) => {
    const id = fresh(s) ? suggestions.get(s.subject)?.courseId : undefined;
    return id && courses.some((c) => c.id === id) ? id : null;
  };

  // Children mount only while the dialog is open, so initialise from props here.
  const [stored, setChoices] = useState<Record<string, SubjectChoice>>(() =>
    Object.fromEntries(
      subjects.map((s) => {
        const earlier = initial[s.subjectKey];
        const suggested = suggestedCourse(s);
        const whole: Choice = {
          target: earlier !== undefined ? (earlier ?? TARGET_SKIP) : (suggested ?? TARGET_NEW),
          name: s.subject,
        };
        const groups = Object.fromEntries(
          s.groups.map((g) => {
            const byGroup = initial[groupMappingKey(s.subjectKey, g)];
            const target = byGroup !== undefined ? (byGroup ?? TARGET_SKIP) : TARGET_NEW;
            return [g, { target, name: `${s.subject} (${g}. csoport)` }];
          })
        );
        // New subjects with several groups start split; earlier choices are kept as they were.
        const split =
          s.groups.length > 0 &&
          (isSplitByGroup(initial, s.subjectKey) || (s.groups.length > 1 && earlier === undefined && !suggested));
        return [s.subjectKey, { split, whole, groups }];
      })
    )
  );

  // A suggestion that arrives later (Jev) applies to subjects the student hasn't touched yet.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const effective = (s: SubjectInfo): SubjectChoice => {
    const choice = stored[s.subjectKey];
    const late = suggestedCourse(s);
    if (!choice || touched.has(s.subjectKey) || !late || choice.whole.target !== TARGET_NEW) return choice;
    return { ...choice, split: false, whole: { ...choice.whole, target: late } };
  };
  const choices = Object.fromEntries(subjects.map((s) => [s.subjectKey, effective(s)]));

  function patch(key: string, change: (c: SubjectChoice) => SubjectChoice) {
    setTouched((prev) => new Set(prev).add(key));
    setChoices((prev) => ({ ...prev, [key]: change(choices[key] ?? prev[key]) }));
  }

  function handleSave() {
    const decisions: Record<string, SubjectDecision> = {};
    for (const s of subjects) {
      const choice = choices[s.subjectKey];
      if (choice.split) {
        for (const g of s.groups) decisions[groupMappingKey(s.subjectKey, g)] = decisionOf(choice.groups[g], `${s.subject} (${g})`);
      } else {
        decisions[s.subjectKey] = decisionOf(choice.whole, s.subject);
      }
    }
    onConfirm(decisions);
    onClose();
  }

  const newCount = subjects.reduce((n, s) => {
    const c = choices[s.subjectKey];
    if (!c) return n;
    return n + (c.split ? s.groups.filter((g) => c.groups[g].target === TARGET_NEW).length : c.whole.target === TARGET_NEW ? 1 : 0);
  }, 0);

  const picker = (label: string, choice: Choice, onChange: (c: Choice) => void) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select aria-label={`${label}: tárgy`} value={choice.target} onChange={(e) => onChange({ ...choice, target: e.target.value })}>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={TARGET_NEW}>Új tárgy létrehozása</option>
        <option value={TARGET_SKIP}>Kihagyás</option>
      </Select>
      {choice.target === TARGET_NEW && (
        <Input aria-label={`${label}: az új tárgy neve`} value={choice.name} onChange={(e) => onChange({ ...choice, name: e.target.value })} />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-muted">
        A Neptun a tárgyneveket gyakran angolul, kód nélkül exportálja, ezért egyszer meg kell adnod, melyik
        tárgyadhoz tartoznak az órák. Az előadás és a gyakorlat külön csoport; ha külön jegyet kapsz rájuk,
        legyenek külön tárgyak. A hozzárendelést a következő importnál is megőrizzük.
      </p>

      {subjects.length === 0 && <p className="text-[14px] text-muted">Nincs hozzárendelendő tárgy.</p>}
      {asking && <p className="text-[13px] text-muted">Javaslatok keresése a tárgyaid között…</p>}

      <ul className="-mx-5 divide-y divide-border/70 border-y border-border/70">
        {subjects.map((s) => {
          const choice = choices[s.subjectKey];
          if (!choice) return null;
          return (
            <li key={s.subjectKey} className="px-5 py-4">
              <p className="text-[14px] font-medium text-foreground">{s.subject}</p>
              <p className="mb-2 text-[12.5px] text-muted">
                {s.count} óra
                {s.groups.length > 0 && ` · csoport: ${s.groups.join(", ")}`}
              </p>
              {s.groups.length > 1 && (
                <label className="mb-2 inline-flex items-center gap-2 text-[13.5px] text-foreground">
                  <input
                    type="checkbox"
                    checked={choice.split}
                    onChange={(e) => patch(s.subjectKey, (c) => ({ ...c, split: e.target.checked }))}
                  />
                  Csoportonként külön tárgy
                </label>
              )}
              {choice.split ? (
                <div className="flex flex-col gap-3">
                  {s.groups.map((g) => (
                    <div key={g}>
                      <p className="mb-1 text-[13px] font-semibold text-heading">{g}. csoport</p>
                      {picker(`${s.subject}, ${g}. csoport`, choice.groups[g], (next) =>
                        patch(s.subjectKey, (c) => ({ ...c, groups: { ...c.groups, [g]: next } }))
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                picker(s.subject, choice.whole, (next) => patch(s.subjectKey, (c) => ({ ...c, whole: next })))
              )}
              {!touched.has(s.subjectKey) && !choice.split && choice.whole.target === suggestedCourse(s) && (
                <SuggestionNote suggestion={suggestions.get(s.subject)} />
              )}
            </li>
          );
        })}
      </ul>

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button type="button" onClick={handleSave}>
          {newCount > 0 ? `Mentés (${newCount} új tárgy)` : "Mentés"}
        </Button>
      </DialogActions>
    </div>
  );
}
