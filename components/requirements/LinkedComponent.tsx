"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, ChevronDown, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { instanceLabel, instanceSnapshot, resolveInstances, type Instance } from "@/lib/rules/instances";
import { isMultiInstance, linkModes, type ComponentLink, type LinkTarget } from "@/lib/rules/links";
import type { RequirementResult, Scale } from "@/lib/rules/types";
import { useMinuteNow } from "@/lib/useCatchUp";
import { ComponentLinkDialog } from "@/components/requirements/ComponentLinkDialog";
import { InstanceInput, type ResultPatch } from "@/components/requirements/InstanceInput";

// A component on the course page together with its calendar link: the "Időpontok" control,
// and for a linked attendance or series one row per class, week or deadline instead of the
// numbered cells.

function linkSummary(link: ComponentLink, count: number): string {
  if (link.mode === "deadlines") return count === 1 ? "1 határidőhöz kötve" : `${count} határidőhöz kötve`;
  if (link.mode === "weeks") return `${link.weeks.join(", ")}. hét`;
  const from = link.selector.fromWeek ? `, ${link.selector.fromWeek}. héttől` : "";
  const groups = link.selector.groups?.length ? `, ${link.selector.groups.join(", ")}. csoport` : "";
  return `${count} óra${groups}${from}`;
}

function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-[var(--radius)] px-1.5 text-[12.5px] text-muted hover:bg-wash/[0.05] hover:text-heading"
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}

export function LinkedComponent({
  courseId,
  target,
  scale,
  link,
  results,
  labelOf,
  children,
}: {
  courseId: string;
  target: LinkTarget;
  scale?: Scale;
  link: ComponentLink | undefined;
  results: RequirementResult[];
  labelOf: (id: string) => string;
  /** The component's usual input (M1), shown when it isn't replaced by the instance list. */
  children: ReactNode;
}) {
  const sessions = useStore((s) => s.classSessions);
  const deadlines = useStore((s) => s.deadlines);
  const semester = useStore((s) => s.semester);
  const setItems = useStore((s) => s.setRequirementResults);
  const [editing, setEditing] = useState(false);
  const now = useMinuteNow();

  const instances = useMemo(
    () => (link ? resolveInstances(target, link, { courseId, sessions, deadlines, semester, results }) : []),
    [link, target, courseId, sessions, deadlines, semester, results]
  );

  if (linkModes(target).length === 0) return <>{children}</>;

  function save(instance: Instance, patch: ResultPatch) {
    setItems([{ courseId, componentId: target.id, instanceKey: instance.key, patch: patch && { ...patch, ...instanceSnapshot(instance) } }]);
  }

  const dialog = (
    <ComponentLinkDialog open={editing} onClose={() => setEditing(false)} courseId={courseId} target={target} link={link} />
  );

  if (!link || !isMultiInstance(target)) {
    const single = instances[0];
    const when = single && (single.at || single.week !== undefined) ? instanceLabel(single) : null;
    return (
      <div>
        {children}
        <div className="-mt-1.5 flex flex-wrap items-center gap-x-2 pb-2 text-[12.5px] text-muted">
          {link && when && <span className="tabular-nums">{when}</span>}
          <LinkButton onClick={() => setEditing(true)}>{link ? "Időpont módosítása" : "Időpont megadása"}</LinkButton>
        </div>
        {dialog}
      </div>
    );
  }

  const nowMs = now.getTime();
  const pinned = instances.filter((i) => i.pinned);
  const earlier = instances.filter((i) => !i.pinned && !i.tracked && !!i.end && Date.parse(i.end) <= nowMs);
  const main = instances.filter((i) => !i.pinned && !earlier.includes(i));

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-heading">{target.label}</span>
        <LinkButton onClick={() => setEditing(true)}>{linkSummary(link, instances.length - pinned.length)}</LinkButton>
      </div>
      {main.length === 0 && earlier.length === 0 && (
        <p className="mt-1 text-[13px] text-muted">Nincs ide illő alkalom. Ellenőrizd az időpontokat.</p>
      )}
      <InstanceRows rows={main} target={target} scale={scale} labelOf={labelOf} onSave={save} nowMs={nowMs} />
      {earlier.length > 0 && (
        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[13px] text-muted hover:text-heading">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
            Korábbi alkalmak ({earlier.length}, nem kötelező kitölteni)
          </summary>
          <InstanceRows rows={earlier} target={target} scale={scale} labelOf={labelOf} onSave={save} nowMs={nowMs} />
        </details>
      )}
      {pinned.length > 0 && (
        <div className="mt-2">
          <p className="text-[13px] font-semibold text-heading">Kapcsolat nélküli eredmények</p>
          <p className="text-[12.5px] text-muted-dim">Ezek az alkalmak már nem illenek a beállított időpontokhoz; az eredményük továbbra is számít.</p>
          <InstanceRows rows={pinned} target={target} scale={scale} labelOf={labelOf} onSave={save} nowMs={nowMs} removable />
        </div>
      )}
      {dialog}
    </div>
  );
}

function InstanceRows({
  rows,
  target,
  scale,
  labelOf,
  onSave,
  nowMs,
  removable = false,
}: {
  rows: Instance[];
  target: LinkTarget;
  scale?: Scale;
  labelOf: (id: string) => string;
  onSave: (instance: Instance, patch: ResultPatch) => void;
  nowMs: number;
  removable?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-col">
      {rows.map((instance) => {
        const label = instanceLabel(instance);
        const future = !!instance.at && Date.parse(instance.at) > nowMs;
        return (
          <li key={instance.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/60 py-2 first:border-t-0">
            <span className={`min-w-[11rem] flex-1 text-[13px] tabular-nums ${future ? "text-muted-dim" : "text-foreground"}`}>{label}</span>
            <InstanceInput
              target={target}
              scale={scale}
              result={instance.result}
              label={`${target.label}, ${label}`}
              onChange={(patch) => onSave(instance, patch)}
              labelOf={labelOf}
            />
            {removable && (
              <button
                type="button"
                aria-label={`${label}: eredmény törlése`}
                onClick={() => {
                  if (confirm("Biztosan törlöd ezt az eredményt?")) onSave(instance, null);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
