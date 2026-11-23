"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { useStore } from "@/lib/store";
import type { ExamEligibilityEval } from "@/lib/rules/engine";
import { subjectRules } from "@/lib/rules/system";
import type { Gate, RequirementRules } from "@/lib/rules/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { GateIcon } from "./GateIcon";

export function ExamEligibility({ rules, evaluation }: { rules: RequirementRules; evaluation?: ExamEligibilityEval }) {
  const t = useT().trackerPlanning;
  const [open, setOpen] = useState(false);
  const candidate = rules.outcomes.some((outcome) => outcome.kind === "gyakorlat" || outcome.kind === "vizsga");
  if (!candidate && !evaluation) return null;

  return (
    <section className="sheet-paper px-5 py-4 sm:px-6" aria-labelledby="exam-eligibility">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="exam-eligibility" className="font-display text-subhead text-heading">{t.eligibility}</h3>
          <p className={`mt-1 text-body ${evaluation?.status === "blocked" ? "font-semibold text-danger" : "text-muted"}`}>
            {evaluation ? t[evaluation.status] : t.notConfigured}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="h-auto whitespace-normal py-1.5" onClick={() => setOpen(true)}>{t.setEligibility}</Button>
      </div>
      {evaluation && <ul className="mt-3 space-y-2">
        {[...evaluation.gates].sort((a, b) => Number(a.status === "met") - Number(b.status === "met")).map((gate, index) => (
          <li key={`${gate.id}:${index}`} className="flex items-start gap-2 text-small">
            <GateIcon status={gate.status} />
            <span>{gate.label}<span className="sr-only"> · {gate.status === "met" ? t.eligible : gate.status === "failed" ? t.blocked : t.pending}</span></span>
          </li>
        ))}
      </ul>}
      {evaluation?.status === "pending" && evaluation.pendingLabels.length > 0 && <p className="mt-3 text-small text-muted">
        {t.awaitingEligibility(evaluation.pendingLabels.join(", "))}
      </p>}
      {open && <EligibilityEditor rules={rules} onClose={() => setOpen(false)} />}
    </section>
  );
}

function EligibilityEditor({ rules, onClose }: { rules: RequirementRules; onClose: () => void }) {
  const t = useT();
  const p = t.trackerPlanning;
  const setRules = useStore((s) => s.setRequirementRules);
  const grades = rules.outcomes.filter((outcome) => outcome.kind === "gyakorlat");
  const [outcomeId, setOutcomeId] = useState(grades[0]?.id ?? "");
  const [minimum, setMinimum] = useState(2);
  const [conditions, setConditions] = useState<Gate[]>(rules.examEligibility ?? []);
  const examGates = rules.outcomes.filter((o) => o.kind === "vizsga").flatMap((o) => o.gates ?? []);
  const unused = examGates.filter((gate) => !conditions.some((c) => c.test === gate.test));
  const target = grades.find((grade) => grade.id === outcomeId);
  const formula = target ? `grade(${target.id}) >= ${minimum}` : "";
  const canAdd = !!target && !conditions.some((c) => c.test === formula);
  const maxGates = 10;
  function save() {
    setRules(rules.courseId, { ...subjectRules(rules), examEligibility: conditions.length ? conditions : undefined,
      source: rules.source, templateId: rules.templateId });
    onClose();
  }
  return <Dialog open title={p.eligibility} onClose={onClose}>
    <div className="space-y-4">
      <p className="text-body text-muted">{p.reviewEligibility}</p>
      <ul className="divide-y divide-border border-y border-border">
        {conditions.map((condition, i) => <li key={`${condition.id}:${i}`} className="flex items-start justify-between gap-3 py-2 text-small">
          <span>{condition.label}</span>
          <Button variant="ghost" size="sm" aria-label={p.removeCondition(condition.label)}
            onClick={() => setConditions(conditions.filter((_, index) => i !== index))}>{t.common.delete}</Button>
        </li>)}
      </ul>
      {grades.length > 0 && <>
        <p className="text-small text-muted">{p.eligibilityHelp}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label className="text-small font-semibold">{p.selectOutcome}
            <Select value={outcomeId} onChange={(e) => setOutcomeId(e.target.value)}>{grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</Select>
          </label>
          <label className="text-small font-semibold">{p.minimumGrade}
            <Select value={minimum} onChange={(e) => setMinimum(Number(e.target.value))}>{[2, 3, 4, 5].map((g) => <option key={g}>{g}</option>)}</Select>
          </label>
        </div>
        <Button size="sm" variant="secondary" disabled={!canAdd || conditions.length >= maxGates}
          onClick={() => target && setConditions([...conditions, { id: `admit_${grades.indexOf(target)}_${minimum}`, label: p.condition(target.label, minimum).slice(0, 120), test: formula, onFail: "none" }])}>{p.addCondition}</Button>
      </>}
      {unused.length > 0 && <Button size="sm" variant="secondary" className="ml-1 h-auto whitespace-normal py-1.5" disabled={conditions.length >= maxGates}
        onClick={() => setConditions([...conditions, ...unused].filter((gate, i, all) => all.findIndex((g) => g.test === gate.test) === i).slice(0, maxGates))}>{p.useExamConditions}</Button>}
    </div>
    <DialogActions>
      <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
      <Button onClick={save}>{t.common.save}</Button>
    </DialogActions>
  </Dialog>;
}
