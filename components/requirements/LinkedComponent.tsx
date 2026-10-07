"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarCheck, CalendarPlus, ChevronDown, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { instanceLabel, instanceSnapshot, resolveInstances, type Instance } from "@/lib/rules/instances";
import { isMultiInstance, linkModes, type ComponentLink, type LinkTarget } from "@/lib/rules/links";
import type { RequirementResult, Scale } from "@/lib/rules/types";
import { useMinuteNow } from "@/lib/useCatchUp";
import { ComponentLinkDialog } from "@/components/requirements/ComponentLinkDialog";
import { InstanceInput, type ResultPatch } from "@/components/requirements/InstanceInput";
import { SemesterField } from "@/components/settings/SemesterField";
import { useConfirm } from "@/components/ui/ConfirmDialog";

// A component on the course page together with its calendar link, as one line of the results
// ledger; for a linked attendance or series one row per class, week or deadline instead of the
// numbered cells.

function linkSummary(link: ComponentLink, count: number): string {
  if (link.mode === "deadlines") return count === 1 ? "1 határidőhöz kötve" : `${count} határidőhöz kötve`;
  if (link.mode === "weeks") return `${link.weeks.join(", ")}. hét`;
  const from = link.selector.fromWeek ? `, ${link.selector.fromWeek}. héttől` : "";
  const groups = link.selector.groups?.length ? `, ${link.selector.groups.join(", ")}. csoport` : "";
  return `${count} óra${groups}${from}`;
}

function LinkButton({ linked, label, onClick }: { linked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] transition-colors duration-150 hover:bg-wash/[0.06] hover:text-heading focus-visible:outline-2 focus-visible:outline-accent ${
        linked ? "text-heading" : "text-muted-dim"
      }`}
    >
      {linked ? <CalendarCheck className="h-4 w-4" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
    </button>
  );
}

/**
 * One line of the results ledger: the component's name, its rule and state on the left, the
 * input on the right (or under it when `block`), and the calendar link. A linked attendance or
 * series lists its classes, weeks or deadlines instead of the numbered cells.
 */
export function LinkedComponent({
  courseId,
  target,
  scale,
  link,
  results,
  labelOf,
  meta,
  status,
  summary,
  block = false,
  children,
}: {
  courseId: string;
  target: LinkTarget;
  scale?: Scale;
  link: ComponentLink | undefined;
  results: RequirementResult[];
  labelOf: (id: string) => string;
  /** The rule in a few words ("max. 60 pont · min. 17"). */
  meta?: ReactNode;
  /** A stamp for the component's state ("Sikeres", "Kiváltva"). */
  status?: ReactNode;
  /** What has been collected so far, for components with several entries. */
  summary?: ReactNode;
  /** The input goes under the name (cells, chips) instead of beside it. */
  block?: boolean;
  /** The component's usual input, shown when it isn't replaced by the instance list. */
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

  const linkable = linkModes(target).length > 0;
  const multi = !!link && isMultiInstance(target);
  const pinned = instances.filter((i) => i.pinned);

  function save(instance: Instance, patch: ResultPatch) {
    setItems([{ courseId, componentId: target.id, instanceKey: instance.key, patch: patch && { ...patch, ...instanceSnapshot(instance) } }]);
  }

  let when: string | null = null;
  if (link && multi) when = linkSummary(link, instances.length - pinned.length);
  else if (link) {
    const single = instances[0];
    when = single && (single.at || single.week !== undefined) ? instanceLabel(single) : null;
  }

  const wide = block || multi;
  const head = (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[14px] font-semibold leading-snug text-heading [overflow-wrap:anywhere]">{target.label}</span>
        {status}
      </p>
      {(meta || when) && (
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
          {meta}
          {meta && when && <span aria-hidden> · </span>}
          {when && <span className="tabular-nums text-foreground">{when}</span>}
        </p>
      )}
      {"note" in target && target.note && <p className="mt-0.5 text-[12px] leading-snug text-muted-dim">{target.note}</p>}
    </div>
  );
  const linkButton = linkable && (
    <LinkButton
      linked={!!link}
      label={link ? "Időpont módosítása" : "Időpont megadása"}
      onClick={() => setEditing(true)}
    />
  );

  return (
    <li className={`border-t border-border py-3 ${wide ? "@2xl:col-span-2" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3">
        {head}
        {wide ? (
          summary ? <span className="text-right text-[13px] tabular-nums text-muted">{summary}</span> : <span />
        ) : (
          <div className="flex justify-end">{children}</div>
        )}
        {linkButton || <span />}
      </div>
      {wide && !multi && <div className="mt-2.5">{children}</div>}
      {multi && link && (
        <InstanceList link={link} instances={instances} target={target} scale={scale} labelOf={labelOf} onSave={save} nowMs={now.getTime()} semesterSet={!!semester} />
      )}
      {linkable && <ComponentLinkDialog open={editing} onClose={() => setEditing(false)} courseId={courseId} target={target} link={link} />}
    </li>
  );
}

function InstanceList({
  link,
  instances,
  target,
  scale,
  labelOf,
  onSave,
  nowMs,
  semesterSet,
}: {
  link: ComponentLink;
  instances: Instance[];
  target: LinkTarget;
  scale?: Scale;
  labelOf: (id: string) => string;
  onSave: (instance: Instance, patch: ResultPatch) => void;
  nowMs: number;
  semesterSet: boolean;
}) {
  const pinned = instances.filter((i) => i.pinned);
  const earlier = instances.filter((i) => !i.pinned && !i.tracked && !!i.end && Date.parse(i.end) <= nowMs);
  const main = instances.filter((i) => !i.pinned && !earlier.includes(i));
  return (
    <div className="mt-1">
      {!semesterSet && link.mode === "sessions" && (link.selector.fromWeek || link.selector.toWeek) && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <p className="text-[13px] text-muted">A {link.selector.fromWeek ?? 1}. héttől számoláshoz add meg, mikor kezdődött a félév.</p>
          <SemesterField compact />
        </div>
      )}
      {main.length === 0 && earlier.length === 0 && (
        <p className="mt-1.5 text-[13px] text-muted">Nincs ide illő alkalom. Ellenőrizd az időpontokat.</p>
      )}
      <InstanceRows rows={main} target={target} scale={scale} labelOf={labelOf} onSave={onSave} nowMs={nowMs} />
      {earlier.length > 0 && (
        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[13px] text-muted hover:text-heading">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
            Korábbi alkalmak ({earlier.length}, nem kötelező kitölteni)
          </summary>
          <InstanceRows rows={earlier} target={target} scale={scale} labelOf={labelOf} onSave={onSave} nowMs={nowMs} />
        </details>
      )}
      {pinned.length > 0 && (
        <div className="mt-2">
          <p className="text-[13px] font-semibold text-heading">Kapcsolat nélküli eredmények</p>
          <p className="text-[12.5px] text-muted-dim">Ezek az alkalmak már nem illenek a beállított időpontokhoz; az eredményük továbbra is számít.</p>
          <InstanceRows rows={pinned} target={target} scale={scale} labelOf={labelOf} onSave={onSave} nowMs={nowMs} removable />
        </div>
      )}
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
  const [confirmDialog, ask] = useConfirm();
  if (rows.length === 0) return null;
  return (
    <ul className="mt-1.5 grid grid-cols-1 @2xl:grid-cols-2 @2xl:gap-x-8">
      {rows.map((instance) => {
        const label = instanceLabel(instance);
        const future = !!instance.at && Date.parse(instance.at) > nowMs;
        return (
          <li
            key={instance.key}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border/60 py-2 first:border-t-0 @2xl:[&:nth-child(2)]:border-t-0"
          >
            <span className={`min-w-[8rem] flex-1 text-[13px] tabular-nums ${future ? "text-muted-dim" : "text-foreground"}`}>{label}</span>
            <span className="flex items-center gap-1">
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
                  onClick={async () => {
                    if (await ask({ title: "Törlöd az eredményt?", confirmLabel: "Törlés" })) onSave(instance, null);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </span>
          </li>
        );
      })}
      {confirmDialog}
    </ul>
  );
}
