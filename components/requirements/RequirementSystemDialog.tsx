"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { componentCourseIds, planRequirementSystem, relatedCourseScore, rulesForCourse, sameSemester, systemCourseIds } from "@/lib/rules/system";
import { courseCodes, parseCourseCodes } from "@/lib/rules/courseCode";
import { linkTargets } from "@/lib/rules/links";
import type { RequirementResult, RequirementRules } from "@/lib/rules/types";
import type { Messages } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { RulesChangePreview } from "./RulesChangePreview";
import { RulesPreview } from "./RulesPreview";

export function resultText(result: RequirementResult, t: Messages["requirementSystem"]): string {
  if (result.state === "pending") return t.pending;
  if (result.state === "na") return t.cancelled;
  const v = result.value;
  if (!v) return t.recorded;
  switch (v.kind) {
    case "points": return t.points(v.points);
    case "grade": return t.grade(v.grade);
    case "attendance": return v.status === "present" ? t.present : v.status === "excused" ? t.excused : t.absent;
    case "pm": return v.sign;
    case "quiz": return `${v.bestPercent}%`;
    case "bonus": return t.points(v.points);
    case "assignment": return v.outcome;
  }
}

export function RequirementSystemHistory({ rules }: { rules: RequirementRules }) {
  const t = useT().requirementSystem;
  const courses = useStore((s) => s.courses);
  if (!rules.previousSystems?.length) return null;
  return <details className="sheet-paper px-5 py-4">
    <summary className="cursor-pointer text-body font-semibold text-heading">{t.previous}</summary>
    <div className="mt-4 flex flex-col gap-5">
      {rules.previousSystems.map((snapshot, index) => <details key={index} className="border-t border-border pt-3">
        <summary className="cursor-pointer text-body font-semibold text-heading">{courses.find((c) => c.id === snapshot.rules.courseId)?.name ?? snapshot.rules.courseId} · {index + 1}</summary>
        <div className="mt-3"><RulesPreview rules={snapshot.rules} /></div>
        {snapshot.results.length === 0 ? <p className="mt-3 text-small text-muted">{t.noResults}</p> : <ul className="mt-3 divide-y divide-border">
          {snapshot.results.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2 text-small text-heading">
            <span>{[snapshot.rules.components.find((c) => c.id === r.componentId)?.label ?? snapshot.rules.retakes.find((c) => c.id === r.componentId)?.label ?? r.componentId, r.label ?? r.at ?? r.instanceKey].join(" · ")}</span>
            <span className="font-semibold tabular-nums">{resultText(r, t)}</span>
          </li>)}
        </ul>}
      </details>)}
    </div>
  </details>;
}

export function RequirementSystemDialog({ courseId, draft, documentCodes = [], sourceText, evidence, onDone, onCancel }: {
  courseId: string; draft?: RequirementRules; documentCodes?: string[]; sourceText?: string; evidence?: string[];
  onDone: (rules: RequirementRules, codes: string[]) => void; onCancel: () => void;
}) {
  const t = useT().requirementSystem;
  const courses = useStore((s) => s.courses);
  const allRules = useStore((s) => s.requirementRules);
  const allResults = useStore((s) => s.requirementResults);
  const configure = useStore((s) => s.configureRequirementSystem);
  const updateCourse = useStore((s) => s.updateCourse);
  const current = courses.find((c) => c.id === courseId)!;
  const systems = allRules.filter((r) => courses.some((c) => c.id === r.courseId && sameSemester(c, current)));
  const prior = rulesForCourse(allRules, courseId);
  const [today] = useState(() => new Date());
  const initial = draft ?? rulesForCourse(allRules, courseId) ?? systems[0];
  const [sourceId, setSourceId] = useState(initial?.courseId ?? "");
  const selected = draft ?? systems.find((r) => r.courseId === sourceId);
  const [members, setMembers] = useState(() => [...new Set([courseId, ...(initial ? systemCourseIds(initial) : [])])]);
  const [scopes, setScopes] = useState<Record<string, string[]>>(() => initial && allRules.some((r) => r.id === initial.id)
    ? Object.fromEntries(linkTargets(initial).map((c) => [c.id, componentCourseIds(initial, c.id)])) : {});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(courses.map((c) => [c.id, c.code ?? courseCodes(c).join(", ")])));
  const [error, setError] = useState(false);
  const targets = selected ? linkTargets(selected) : [];
  const assignments = Object.fromEntries(targets.map((c) => [c.id, (scopes[c.id] ?? (members.length === 1 ? members : [])).filter((id) => members.includes(id))]));
  const plan = selected ? planRequirementSystem(allRules, allResults, selected, members, assignments, choices) : undefined;
  const eligible = courses.filter((c) => sameSemester(c, current)).sort((a, b) => relatedCourseScore(current, b, documentCodes) - relatedCourseScore(current, a, documentCodes));
  function changeSource(owner: string) {
    const system = systems.find((r) => r.courseId === owner)!;
    setSourceId(owner); setMembers([...new Set([courseId, ...(rulesForCourse(allRules, courseId) ? systemCourseIds(rulesForCourse(allRules, courseId)!) : []), ...systemCourseIds(system)])]);
    setScopes(Object.fromEntries(linkTargets(system).map((c) => [c.id, componentCourseIds(system, c.id)]))); setChoices({}); setError(false);
  }
  function toggle(id: string, checked: boolean) {
    const related = rulesForCourse(allRules, id);
    const ids = related ? systemCourseIds(related) : [id];
    setMembers((old) => checked ? [...new Set([...old, ...ids])] : old.filter((value) => !ids.includes(value)));
    setChoices({});
  }
  function save() {
    if (!selected || !configure(selected, members, assignments, choices)) { setError(true); return; }
    for (const id of members) {
      const course = courses.find((c) => c.id === id)!;
      if ((codes[id] ?? "") !== (course.code ?? courseCodes(course).join(", "))) updateCourse(id, { code: codes[id]?.trim() || undefined, codes: parseCourseCodes(codes[id]) });
    }
    onDone(plan!.rules, [...new Set(members.flatMap((id) => parseCourseCodes(codes[id]).map((c) => c.code)))]);
  }
  return <Dialog open onClose={onCancel} title={t.title} size="lg">
    <div className="flex flex-col gap-5">
      <p className="text-body text-muted">{t.intro}</p>
      {draft && prior && plan && <RulesChangePreview current={prior} proposed={plan.rules}
        results={allResults.filter((r) => r.courseId === prior.courseId)} kept={plan.results} sourceText={sourceText} evidence={evidence} today={today} />}
      {!selected ? <p className="text-body text-muted">{t.noSystems}</p> : <>
        {!draft && systems.length > 1 && <label className="flex flex-col gap-2 text-body font-semibold text-heading">{t.source}
          <Select value={sourceId} onChange={(e) => changeSource(e.target.value)}>{systems.map((r) => <option key={r.id} value={r.courseId}>{courses.find((c) => c.id === r.courseId)?.name}</option>)}</Select>
        </label>}
        <fieldset className="flex flex-col gap-3"><legend className="mb-3 text-lead font-semibold text-heading">{t.scopeTitle}</legend>
          {eligible.map((c) => <div key={c.id} className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <Checkbox label={c.name} checked={members.includes(c.id)} disabled={c.id === courseId || systemCourseIds(selected).includes(c.id)}
              description={systemCourseIds(selected).includes(c.id) ? t.existingMember : relatedCourseScore(current, c, documentCodes) > 0 ? t.suggested : undefined} onChange={(e) => toggle(c.id, e.target.checked)} />
            {members.includes(c.id) && <label className="flex min-w-0 flex-col gap-1 text-small text-muted">{t.code}
              <Input value={codes[c.id] ?? ""} onChange={(e) => setCodes({ ...codes, [c.id]: e.target.value })} aria-label={`${c.name}: ${t.code}`} />
            </label>}
          </div>)}
        </fieldset>
        {documentCodes.length > 0 && <p className="text-small text-muted">{t.detectedCodes}: <span className="font-semibold text-heading">{documentCodes.join(", ")}</span>. {t.codeReview}</p>}
        <div><h3 className="text-lead font-semibold text-heading">{t.assignments}</h3><p className="mt-1 text-small text-muted">{t.assignmentHint}</p>
          <div className="mt-3 flex flex-col divide-y divide-border">{targets.map((target) => {
            const assigned = assignments[target.id];
            const value = members.length > 1 && assigned.length === members.length ? "__all" : assigned.length === 1 ? assigned[0] : assigned.length > 1 ? "__subset" : "";
            return <label key={target.id} className="grid items-center gap-2 py-3 text-body font-semibold text-heading sm:grid-cols-2">
              {target.label}<Select aria-label={t.appliesTo(target.label)} value={value} onChange={(e) => { if (e.target.value === "__subset") return; setScopes({ ...scopes, [target.id]: e.target.value === "__all" ? members : e.target.value ? [e.target.value] : [] }); setChoices({}); }}>
                <option value="">{t.unassigned}</option>
                {value === "__subset" && <option value="__subset">{assigned.map((id) => courses.find((c) => c.id === id)?.name ?? id).join(" · ")}</option>}
                {members.map((id) => <option key={id} value={id}>{courses.find((c) => c.id === id)?.name}</option>)}
                {members.length > 1 && <option value="__all">{t.shared}</option>}
              </Select>
            </label>;
          })}</div>
          {Object.values(assignments).some((ids) => !ids.length) && <p className="rounded-[var(--radius)] bg-canary px-3 py-2 text-small text-heading">{t.unresolved}</p>}
        </div>
        {plan && plan.affected.length > 1 && <div className="text-small text-muted"><p>{t.preserved}</p>
          <ul className="mt-2 divide-y divide-border">{plan.affected.map((system) => {
            const prior = allResults.filter((r) => r.courseId === system.courseId && [...system.components, ...system.retakes].some((c) => c.id === r.componentId));
            const candidates = prior.filter((r) => plan.consumedIds.includes(r.id)).length;
            return <li key={system.id} className="py-2"><span className="font-semibold text-heading">{courses.find((c) => c.id === system.courseId)?.name}: </span>{t.compatibleResults(candidates)} · {t.historyOnly(prior.length - candidates)}</li>;
          })}</ul>
        </div>}
        {!!plan?.conflicts.length && <fieldset><legend className="text-lead font-semibold text-heading">{t.conflicts}</legend>
          <p className="mt-1 text-small text-muted">{t.conflictsHint}</p>
          {plan.conflicts.map((conflict) => <label key={conflict.key} className="mt-3 flex flex-col gap-2 text-body text-heading">
            {targets.find((c) => c.id === conflict.componentId)?.label} · {conflict.options[0].label ?? conflict.options[0].at ?? conflict.instanceKey}
            <Select aria-label={`${t.chooseResult}: ${conflict.componentId} ${conflict.instanceKey}`} value={choices[conflict.key] ?? ""} onChange={(e) => setChoices({ ...choices, [conflict.key]: e.target.value })}>
              <option value="">{t.chooseResult}</option>
              {conflict.options.map((r) => <option key={r.id} value={r.id}>{courses.find((c) => c.id === r.courseId)?.name}: {resultText(r, t)}</option>)}
            </Select>
          </label>)}
        </fieldset>}
      </>}
      {error && <p role="alert" className="text-body text-danger">{t.error}</p>}
      <DialogActions><Button variant="secondary" onClick={onCancel}>{t.cancel}</Button><Button disabled={!selected || !!plan?.conflicts.some((c) => !choices[c.key])} onClick={save}>{t.save}</Button></DialogActions>
    </div>
  </Dialog>;
}
