"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { useStore } from "@/lib/store";
import { useMinuteNow } from "@/lib/useMinuteNow";
import { evaluate } from "@/lib/rules/engine";
import { instanceLabel, resolveInstances } from "@/lib/rules/instances";
import { linkTargets, type LinkTarget } from "@/lib/rules/links";
import { componentCourseIds } from "@/lib/rules/system";
import { resultId, type RequirementResult, type RequirementRules, type Scale } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { InstanceInput, type ResultPatch } from "./InstanceInput";
import { StandingComparison } from "./StandingComparison";

interface Slot {
  id: string;
  label: string;
  instanceKey: string;
  target: LinkTarget;
  scale?: Scale;
}

export function GradeScenario({ rules, results }: { rules: RequirementRules; results: RequirementResult[] }) {
  const t = useT().trackerPlanning;
  const [loaded, setLoaded] = useState(false);
  if (!rules.outcomes.length && !rules.examEligibility?.length) return null;
  return <details className="sheet-paper px-5 py-4 sm:px-6" onToggle={(event) => { if (event.currentTarget.open) setLoaded(true); }}>
    <summary className="cursor-pointer font-display text-subhead text-heading">{t.scenario}</summary>
    {loaded && <ScenarioEditor key={rules.id} rules={rules} results={results} />}
  </details>;
}

function ScenarioEditor({ rules, results }: { rules: RequirementRules; results: RequirementResult[] }) {
  const messages = useT();
  const t = messages.trackerPlanning;
  const attendance = messages.requirementSystem;
  const locale = useLocale();
  const sessions = useStore((s) => s.classSessions);
  const deadlines = useStore((s) => s.deadlines);
  const semester = useStore((s) => s.semester);
  const now = useMinuteNow();
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Record<string, ResultPatch>>({});
  const base = useMemo(() => evaluate(rules, results, now, locale), [rules, results, now, locale]);
  const slots = useMemo(() => linkTargets(rules).flatMap((target): Slot[] => {
    if (target.kind === "bonus") return [];
    const own = results.filter((r) => r.componentId === target.id);
    const link = rules.calendarLinks?.[target.id];
    const instances = resolveInstances(target, link, {
      courseId: rules.courseId, courseIds: componentCourseIds(rules, target.id), sessions, deadlines, semester, results,
    });
    const known = instances.filter((i) => i.result?.state === "recorded" || i.result?.state === "na");
    const open = instances.filter((i) => !i.result || i.result.state === "pending");
    if (target.kind === "attendance") {
      // Undated estimates let students account for a class that is not in their timetable yet.
      const count = Math.max(0, ...Object.keys(draft).filter((id) => id.startsWith(`${target.id}|scenario:`)).map((id) => Number(id.split(":").at(-1))));
      for (let i = 1; i <= count + 1; i++) open.push({ key: `scenario:${i}`, tracked: false, pinned: false });
    }
    if (target.kind === "series") {
      const remaining = Math.max(0, target.count - known.length - open.length);
      for (let i = 1; i <= remaining; i++) open.push({ key: `scenario:${i}`, tracked: false, pinned: false });
    }
    const first = target.kind === "retake" ? rules.components.find((c) => c.id === target.targets[0]) : undefined;
    return open.filter((i) => !own.some((r) => r.instanceKey === i.key && r.state !== "pending")).map((i, index) => ({
      id: `${target.id}|${i.key}`, target, instanceKey: i.key,
      label: i.at ? `${target.label} · ${instanceLabel(i, locale)}` : target.kind === "attendance"
        ? `${target.label} · ${t.hypotheticalClass} ${i.key.split(":")[1]}`
        : target.kind === "series" ? t.scenarioComponent(target.label, known.length + index + 1) : target.label,
      scale: first?.kind === "exam" ? first.scale : undefined,
    }));
  }), [rules, results, sessions, deadlines, semester, locale, t, draft]);

  // A recorded result can arrive from another tab while the scenario is open.
  const active = useMemo(() => slots.filter((slot) => Object.hasOwn(draft, slot.id)), [slots, draft]);
  const available = slots.filter((slot) => !Object.hasOwn(draft, slot.id));
  const activeSelection = available.some((s) => s.id === selected) ? selected : available[0]?.id ?? "";
  const proposed = useMemo(() => {
    const changes = active.flatMap((slot): RequirementResult[] => {
      const patch = draft[slot.id];
      if (!patch) return [];
      return [{ ...patch, id: resultId(rules.courseId, slot.target.id, slot.instanceKey), courseId: rules.courseId,
        componentId: slot.target.id, instanceKey: slot.instanceKey }];
    });
    const ids = new Set(changes.map((r) => r.id));
    return evaluate(rules, [...results.filter((r) => !ids.has(r.id)), ...changes], now, locale);
  }, [active, draft, rules, results, now, locale]);

  return <div className="mt-3 flex flex-col gap-4">
    <p className="text-small text-muted">{t.scenarioHint}</p>
    {available.length > 0 && <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-52 text-small font-semibold">{t.scenarioSlot}
        <Select value={activeSelection} onChange={(e) => setSelected(e.target.value)}>
          {available.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </label>
      <Button variant="secondary" disabled={!activeSelection} onClick={() => setDraft({ ...draft, [activeSelection]: null })}>{t.addScenario}</Button>
    </div>}
    {!active.length && <p className="text-small text-muted">{t.scenarioEmpty}</p>}
    {!!active.length && <>
      <ul className="divide-y divide-border border-y border-border">
        {active.map((slot) => {
          const patch = draft[slot.id];
          const update = (value: ResultPatch) => setDraft((old) => ({ ...old, [slot.id]: value }));
          return <li key={slot.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-body font-semibold text-heading">{slot.label}</p>
              {slot.target.kind === "attendance" ? <Select aria-label={slot.label}
                value={patch?.value?.kind === "attendance" ? patch.value.status : ""}
                onChange={(e) => {
                  const status = e.target.value;
                  update(status === "present" || status === "excused" || status === "unexcused" ? { state: "recorded", value: { kind: "attendance", status } } : null);
                }}>
                <option value="">–</option>
                <option value="present">{attendance.present}</option>
                <option value="unexcused">{attendance.absent}</option>
                <option value="excused">{attendance.excused}</option>
              </Select> : <InstanceInput target={slot.target} scale={slot.scale} label={slot.label}
                labelOf={(id) => rules.components.find((c) => c.id === id)?.label ?? id}
                result={patch ? { ...patch, id: slot.id, courseId: rules.courseId, componentId: slot.target.id, instanceKey: slot.instanceKey } : undefined}
                onChange={update} />}
            </div>
            <Button variant="ghost" size="sm" aria-label={t.removeScenario(slot.label)} onClick={() => setDraft((old) => {
              const next = { ...old }; delete next[slot.id]; return next;
            })}><X className="h-4 w-4" aria-hidden /></Button>
          </li>;
        })}
      </ul>
      <StandingComparison before={base} after={proposed} scenario />
      <Button size="sm" variant="secondary" className="self-start" onClick={() => setDraft({})}>{t.resetScenario}</Button>
    </>}
  </div>;
}
