"use client";

import { useState } from "react";
import { ExternalLink, Split } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatKindLabel } from "@/lib/ical/canvas";
import {
  findExistingCourse,
  groupContexts,
  pendingContexts,
  splitGroup,
  type DiscoveryDecision,
  type DiscoveryGroup,
} from "@/lib/ical/discover";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const TARGET_NEW = "__new";
const TARGET_SKIP = "__skip";

interface GroupChoice {
  target: string; // TARGET_NEW, TARGET_SKIP or an existing course id
  name: string;
}

export interface DiscoveryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DiscoveryDialog({ open, onClose }: DiscoveryDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Tárgyak felvétele a naptárból" size="lg">
      <DiscoveryForm onClose={onClose} />
    </Dialog>
  );
}

function DiscoveryForm({ onClose }: { onClose: () => void }) {
  const courses = useStore((s) => s.courses);
  const applyDiscovery = useStore((s) => s.applyDiscovery);

  // Children only mount while the dialog is open, so initialise from the store here.
  const [groups, setGroups] = useState<DiscoveryGroup[]>(() =>
    groupContexts(pendingContexts(useStore.getState().feeds, useStore.getState().courses))
  );
  // Explicit choices keyed by group id; untouched groups fall back to defaults.
  const [choices, setChoices] = useState<Record<string, GroupChoice>>({});

  function choiceOf(group: DiscoveryGroup): GroupChoice {
    return (
      choices[group.id] ?? {
        target: findExistingCourse(group, courses) ?? TARGET_NEW,
        name: group.baseName,
      }
    );
  }

  function setChoice(group: DiscoveryGroup, patch: Partial<GroupChoice>) {
    setChoices((prev) => ({ ...prev, [group.id]: { ...choiceOf(group), ...patch } }));
  }

  function handleSplit(group: DiscoveryGroup) {
    setGroups((prev) => prev.flatMap((g) => (g.id === group.id ? splitGroup(group) : [g])));
    setChoices((prev) => {
      const { [group.id]: _removed, ...rest } = prev;
      void _removed;
      return rest;
    });
  }

  const decisions: DiscoveryDecision[] = groups.map((group) => {
    const { target, name } = choiceOf(group);
    if (target === TARGET_SKIP) return { kind: "skip", items: group.items };
    if (target === TARGET_NEW) {
      return { kind: "new", name: name.trim() || group.baseName, items: group.items };
    }
    return { kind: "existing", courseId: target, items: group.items };
  });
  const newCount = decisions.filter((d) => d.kind === "new").length;

  function handleSave() {
    applyDiscovery(decisions);
    onClose();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        A naptáradban ezeket a tárgyakat találtuk. Az előadás és a gyakorlat alapból egy tárgy
        lesz – ha külön szeretnéd, bontsd szét.
      </p>

      {groups.length === 0 && <p className="text-sm text-muted">Nincs új tárgy.</p>}

      <ul className="flex flex-col gap-3">
        {groups.map((group) => {
          const choice = choiceOf(group);
          return (
            <li key={group.id} className="rounded-md border border-border bg-card p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Input
                    aria-label="Tárgy neve"
                    value={choice.name}
                    disabled={choice.target !== TARGET_NEW}
                    onChange={(e) => setChoice(group, { name: e.target.value })}
                  />
                  {group.semester && (
                    <p className="mt-1 text-xs text-muted">{group.semester}</p>
                  )}
                </div>
                <Select
                  aria-label="Mi legyen vele"
                  value={choice.target}
                  onChange={(e) => setChoice(group, { target: e.target.value })}
                >
                  <option value={TARGET_NEW}>Új tárgy</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={TARGET_SKIP}>Kihagyás</option>
                </Select>
              </div>

              <ul className="mt-2 flex flex-col gap-1">
                {group.items.map(({ context }) => (
                  <li key={context.key} className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {context.kind && (
                      <Badge color="#2563eb">{formatKindLabel(context.kind)}</Badge>
                    )}
                    {context.code && <span>{context.code}</span>}
                    <span>· {context.eventCount} határidő</span>
                    {context.courseUrl && (
                      <a
                        href={context.courseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Kurzus megnyitása"
                        className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>

              {group.items.length > 1 && (
                <div className="mt-2 flex justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleSplit(group)}>
                    <Split className="h-4 w-4" />
                    Szétbontás
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button type="button" onClick={handleSave} disabled={groups.length === 0}>
          {newCount > 0 ? `Mentés (${newCount} új tárgy)` : "Mentés"}
        </Button>
      </div>
    </div>
  );
}
