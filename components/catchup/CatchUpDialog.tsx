"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useStore } from "@/lib/store";
import { canAwait, type CatchUpField, type CatchUpGroup } from "@/lib/catchup";
import { instanceLabel, instanceSnapshot, shortDayLabel } from "@/lib/rules/instances";
import { resultId, type RequirementResult } from "@/lib/rules/types";
import { budapestTime } from "@/lib/ical/budapest";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { InstanceInput, type ResultPatch } from "@/components/requirements/InstanceInput";

// "Mi történt az óráidon?": one slip per class (attendance and röpzh together), deadline or
// exam that ended without a result. Every answer is saved at once, so closing loses nothing.
// The quick path: the first score field has focus, Enter goes to the next empty one and, after
// the last, finishes; "Kész" sends every score left empty on the pages seen to the reminders as
// "Eredményre vár" (pending). Closing with X leaves them to record later.

const PAGE_SIZE = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const LATE_MS = 7 * DAY_MS;
/** With more than this many slips, the ones older than two weeks wait in the reminders. */
const MANY = 20;
const RECENT_MS = 14 * DAY_MS;

type SetItems = ReturnType<typeof useStore.getState>["setRequirementResults"];

function fieldHasResult(f: CatchUpField, byId: Map<string, RequirementResult>): boolean {
  return byId.has(resultId(f.courseId, f.target.id, f.instance.key));
}

function groupTitle(group: CatchUpGroup): string {
  if (group.deadline) return group.deadline.title;
  // Neptun subject names are often English; the course name stands for the class.
  if (group.session) return "";
  return group.fields[0]?.target.label ?? "";
}

function groupWhen(group: CatchUpGroup): string {
  if (group.deadline) {
    const due = new Date(group.deadline.due);
    return `lejárt: ${shortDayLabel(due)} ${budapestTime(due)}`;
  }
  return instanceLabel(group.fields[0].instance);
}

function countLine(groups: CatchUpGroup[]): string {
  const classes = groups.filter((g) => g.session).length;
  const deadlines = groups.filter((g) => g.deadline).length;
  const other = groups.length - classes - deadlines;
  const parts = [
    classes > 0 && `${classes} óra`,
    deadlines > 0 && `${deadlines} határidő`,
    other > 0 && `${other} számonkérés`,
  ].filter(Boolean);
  return `${parts.join(", ")} vár adatra.`;
}

export function CatchUpDialog({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  /** The slips to show, fixed when the dialog opened (answered ones stay, ticked off). */
  groups: CatchUpGroup[];
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Mi történt az óráidon?" size="lg">
      <CatchUpBody groups={groups} onClose={onClose} />
    </Dialog>
  );
}

function CatchUpBody({ groups, onClose }: { groups: CatchUpGroup[]; onClose: () => void }) {
  const results = useStore((s) => s.requirementResults);
  const courses = useStore((s) => s.courses);
  const rules = useStore((s) => s.requirementRules);
  const setItems = useStore((s) => s.setRequirementResults);
  const [page, setPage] = useState(0);
  const [seenPages, setSeenPages] = useState<Set<number>>(() => new Set([0]));
  const [showOld, setShowOld] = useState(false);
  // Children mount per open, so "now" is the time the dialog opened.
  const [openedAt] = useState(() => Date.now());

  const byId = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const old = groups.length > MANY ? groups.filter((g) => openedAt - Date.parse(g.end) > RECENT_MS) : [];
  const visible = showOld || old.length === 0 ? groups : groups.filter((g) => !old.includes(g));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const open = visible.filter((g) => !g.fields.every((f) => fieldHasResult(f, byId)));

  const labelOf = (courseId: string, id: string) =>
    rules.find((r) => r.courseId === courseId)?.components.find((c) => c.id === id)?.label ?? id;

  function save(field: CatchUpField, patch: ResultPatch) {
    setItems([itemFor(field, patch)]);
  }

  function goTo(next: number) {
    setPage(next);
    setSeenPages((prev) => new Set(prev).add(next));
  }

  /** Kész: every empty score on the pages seen waits for its result in the reminders. */
  function finish() {
    const recorded = new Map(useStore.getState().requirementResults.map((r) => [r.id, r]));
    const seen = visible.filter((_, i) => seenPages.has(Math.floor(i / PAGE_SIZE)));
    const items = seen.flatMap((g) => g.fields.filter((f) => canAwait(f) && !fieldHasResult(f, recorded)).map((f) => itemFor(f, { state: "pending" })));
    if (items.length > 0) setItems(items);
    onClose();
  }

  /** Enter in a score field: on to the next empty one, or finish after the last. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const input = event.target;
    if (event.key !== "Enter" || !(input instanceof HTMLInputElement) || input.inputMode !== "decimal") return;
    event.preventDefault();
    const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')];
    const next = fields.slice(fields.indexOf(input) + 1).find((f) => f.value === "");
    if (next) next.focus();
    else setTimeout(finish, 0); // after the field's own Enter has saved it
  }

  function allPresent() {
    const items = slice.flatMap((g) =>
      g.fields
        .filter((f) => f.target.kind === "attendance" && !fieldHasResult(f, byId))
        .map((f) => itemFor(f, { state: "recorded", value: { kind: "attendance", status: "present" } }))
    );
    setItems(items);
  }

  const emptyScores = open.some((g) => g.fields.some((f) => canAwait(f) && !fieldHasResult(f, byId)));

  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
      <p className="text-[14px] text-muted">
        {open.length > 0 ? countLine(open) : "Mindent rögzítettél."} A válaszaidat azonnal mentjük.
      </p>

      <ol className="flex flex-col gap-4">
        {slice.map((group, i) => (
          <CatchUpSlip
            key={group.key}
            group={group}
            index={i}
            color={courseById.get(group.courseId)?.color}
            courseName={courseById.get(group.courseId)?.name}
            byId={byId}
            late={openedAt - Date.parse(group.end) > LATE_MS}
            onSave={save}
            setItems={setItems}
            labelOf={(id) => labelOf(group.courseId, id)}
          />
        ))}
      </ol>

      {old.length > 0 && !showOld && (
        <p className="text-[13px] text-muted">
          {old.length} két hétnél régebbi tétel az Emlékeztetők között maradt.{" "}
          <button type="button" className="font-semibold text-heading underline underline-offset-2" onClick={() => setShowOld(true)}>
            Megmutatom
          </button>
        </p>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
          <Button type="button" variant="ghost" size="sm" disabled={current === 0} onClick={() => goTo(current - 1)}>
            Vissza
          </Button>
          <span className="tabular-nums">
            {current + 1} / {pages}
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={current >= pages - 1} onClick={() => goTo(current + 1)}>
            Tovább
          </Button>
        </div>
      )}

      {emptyScores && (
        <p className="text-[13px] text-muted">Amit üresen hagysz, az a csengőben vár az eredményre.</p>
      )}

      <DialogActions>
        {slice.some((g) => g.fields.some((f) => f.target.kind === "attendance" && !fieldHasResult(f, byId))) && (
          <Button type="button" variant="ghost" onClick={allPresent} className="sm:mr-auto">
            Mindenhol ott voltam
          </Button>
        )}
        <Button type="button" onClick={finish}>
          Kész
        </Button>
      </DialogActions>
    </div>
  );
}

function itemFor(field: CatchUpField, patch: ResultPatch): Parameters<SetItems>[0][number] {
  return {
    courseId: field.courseId,
    componentId: field.target.id,
    instanceKey: field.instance.key,
    patch: patch && { ...patch, ...instanceSnapshot(field.instance) },
  };
}

function CatchUpSlip({
  group,
  index,
  color,
  courseName,
  byId,
  late,
  onSave,
  setItems,
  labelOf,
}: {
  group: CatchUpGroup;
  index: number;
  color?: string;
  courseName?: string;
  byId: Map<string, RequirementResult>;
  late: boolean;
  onSave: (field: CatchUpField, patch: ResultPatch) => void;
  setItems: SetItems;
  labelOf: (componentId: string) => string;
}) {
  const done = group.fields.every((f) => fieldHasResult(f, byId));
  const cancelled = group.fields.every((f) => byId.get(resultId(f.courseId, f.target.id, f.instance.key))?.state === "na");
  const title = groupTitle(group);
  const heading = !title ? (courseName ?? group.session?.subject ?? "") : courseName && courseName !== title ? `${courseName} · ${title}` : title;

  function cancelAll() {
    setItems(group.fields.map((f) => itemFor(f, cancelled ? null : { state: "na" })));
  }

  return (
    <li
      data-done={done}
      style={{ "--i": index } as CSSProperties}
      className={`slip px-4 pb-3 pt-4 ${late && !done ? "bg-salmon" : "bg-card"}`}
    >
      <span aria-hidden="true" className="pin -top-[4px] left-[14px]" style={{ "--pin-color": color ?? "var(--border-strong)" } as CSSProperties} />
      <fieldset className="min-w-0">
        <legend className="contents">
          <span className="block text-[15px] font-bold leading-snug text-heading [overflow-wrap:anywhere]">
            {heading}
          </span>
          <span className="mt-0.5 block text-[12.5px] tabular-nums text-muted">{groupWhen(group)}</span>
        </legend>
        <div className="mt-3 flex flex-col divide-y divide-border">
          {group.fields.map((f) => {
            const result = byId.get(resultId(f.courseId, f.target.id, f.instance.key));
            const awaiting = result?.state === "pending";
            return (
              <div key={f.target.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <span className="min-w-[7rem] text-[13.5px] font-semibold text-heading">{f.target.label}</span>
                <span className="flex flex-1 flex-wrap items-center gap-2">
                  {awaiting && <span className="rounded-[var(--radius)] bg-canary px-2 py-1 text-[12.5px] font-semibold text-heading">Eredményre vár</span>}
                  <InstanceInput
                    target={f.target}
                    scale={f.scale}
                    result={result}
                    label={`${heading}: ${f.target.label}`}
                    onChange={(patch) => onSave(f, patch)}
                    labelOf={labelOf}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-end">
          <button type="button" onClick={cancelAll} className="h-8 rounded-[var(--radius)] px-2 text-[13px] text-muted hover:bg-wash/[0.05] hover:text-heading">
            {cancelled ? "Visszavonás" : "Elmaradt / nem releváns"}
          </button>
        </div>
      </fieldset>
    </li>
  );
}
