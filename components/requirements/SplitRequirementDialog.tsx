"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { useStore } from "@/lib/store";
import { previewRequirementSplit } from "@/lib/rules/splitSystem";
import { systemCourseIds } from "@/lib/rules/system";
import type { RequirementRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { showToast } from "@/components/ui/Toast";

export function SplitRequirementDialog({ rules, courseId, onClose }: { rules: RequirementRules; courseId: string; onClose: () => void }) {
  const { trackerPlanning: t, common } = useT();
  const courses = useStore((s) => s.courses);
  const results = useStore((s) => s.requirementResults);
  const sessions = useStore((s) => s.classSessions);
  const deadlines = useStore((s) => s.deadlines);
  const semester = useStore((s) => s.semester);
  const split = useStore((s) => s.splitRequirementSystem);
  const members = systemCourseIds(rules);
  const [selected, setSelected] = useState(courseId === rules.courseId ? members[1] : courseId);
  const [error, setError] = useState(false);
  const plan = previewRequirementSplit(rules, selected, { results, sessions, deadlines, semester });
  const name = (id: string) => courses.find((c) => c.id === id)?.name ?? id;

  function confirm() {
    if (!plan || !split(rules, selected, results)) { setError(true); return; }
    const state = useStore.getState();
    const owners = [plan.remaining.rules.courseId, plan.detached.rules.courseId];
    const trackers = state.requirementRules.filter((r) => owners.includes(r.courseId));
    const splitResults = state.requirementResults.filter((r) => owners.includes(r.courseId));
    const movedIds = [...plan.remaining.results, ...plan.detached.results].map((result) => result.id);
    onClose();
    showToast({
      message: t.splitSaved, actionLabel: t.undoSplit,
      onAction: () => {
        const restored = useStore.getState().undoRequirementSplit(rules, plan.originals, trackers, splitResults, movedIds);
        if (!restored) window.setTimeout(() => showToast({ message: t.undoUnavailable }), 0);
      },
    });
  }

  return <Dialog open title={t.split} onClose={onClose} size="lg">
    <div className="space-y-4">
      <p className="text-body text-muted">{t.splitHelp}</p>
      <label className="block text-small font-semibold">{t.splitCourse}
        <Select className="mt-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {members.map((id) => <option key={id} value={id}>{name(id)}</option>)}
        </Select>
      </label>
      {plan && <section aria-labelledby="split-preview">
        <h3 id="split-preview" className="text-lead font-semibold">{t.splitPreview}</h3>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {[plan.remaining, plan.detached].map((side) => <li key={side.rules.id} className="flex flex-col gap-1 py-3">
            <strong className="break-words text-heading">{systemCourseIds(side.rules).map(name).join(" · ")}</strong>
            <p className="text-small text-muted">
              {[t.ruleCount(side.rules.components.length + side.rules.retakes.length), t.resultCount(side.results.length),
                t.attendanceCount(side.results.filter((r) => side.rules.components.some((c) => c.id === r.componentId && c.kind === "attendance")).length),
                t.linkCount(Object.keys(side.rules.calendarLinks ?? {}).length)].join(" · ")}
            </p>
            {!!side.rules.components.length && <p className="text-small">{side.rules.components.map((c) => c.label).join(", ")}</p>}
          </li>)}
        </ul>
        {!!plan.historyOnly.length && <p className="mt-2 text-small text-muted">{t.historyCount(plan.historyOnly.length)}</p>}
        {!!plan.historyOutcomes.length && <p className="mt-2 text-small text-muted">
          {t.historicalOutcomes(plan.historyOutcomes.length)} · {plan.historyOutcomes.map((o) => o.label).join(", ")}
        </p>}
      </section>}
      {error && <p role="alert" className="text-body text-danger">{t.splitChanged}</p>}
    </div>
    <DialogActions>
      <Button variant="secondary" onClick={onClose}>{common.cancel}</Button>
      <Button onClick={confirm} disabled={!plan}>{t.confirmSplit}</Button>
    </DialogActions>
  </Dialog>;
}
