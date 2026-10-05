"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Calculator, Check, CircleDashed, Code, FileText, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { evaluate, type GateStatus, type GradeValue, type OutcomeEval } from "@/lib/rules/engine";
import { RULE_TEMPLATES, ruleTemplate } from "@/lib/rules/fixtures";
import { solveFor, type SolveResult } from "@/lib/rules/solve";
import type { RequirementResult, RequirementRules, Scale, SubjectRules } from "@/lib/rules/types";
import { validateRules } from "@/lib/rules/validate";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Pill } from "@/components/ui/Pill";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ExtractForm } from "@/components/requirements/ExtractDialog";
import { SharedTemplateOffer, TemplateReview, useSharedTemplate, type TemplateOffer } from "@/components/requirements/SharedTemplate";
import {
  AssignmentInput,
  AttendanceInput,
  BonusInput,
  ExamInput,
  RetakeInput,
  SeriesInput,
  useResultSetter,
} from "@/components/requirements/ResultInputs";

// The checked part of the requirements: a rule set (from a template or written as JSON), the
// student's results against it, the standing of every grade and "what do I need" answers.

const EMPTY_RESULTS: RequirementResult[] = [];

/** The rule set without its storage fields, as edited and validated. */
function subjectRulesOf(rules: RequirementRules): SubjectRules {
  const { schemaVersion, components, retakes, derived, tables, outcomes, flags } = rules;
  return { schemaVersion, components, retakes, derived, tables, outcomes, flags };
}

const gradeText = (g: GradeValue | null) => (g === null || g === 0 ? "nincs jegy" : String(g));

const STATUS_TEXT: Record<OutcomeEval["status"], string> = {
  final: "Végleges",
  provisional: "Várható",
  open: "Nyitott",
};

const GATE_TEXT: Record<GateStatus, string> = {
  met: "teljesült",
  failed: "nem teljesült",
  fixable: "pótolható",
  open: "még nyitott",
};

function GateIcon({ status }: { status: GateStatus }) {
  if (status === "met") return <Check className="h-4 w-4 shrink-0 text-muted" aria-hidden />;
  if (status === "failed") return <X className="h-4 w-4 shrink-0 text-danger" aria-hidden />;
  if (status === "fixable") return <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-dim" aria-hidden />;
}

export function RulesPanel({ courseId }: { courseId: string }) {
  const rules = useStore((s) => s.requirementRules.find((r) => r.courseId === courseId));
  const allResults = useStore((s) => s.requirementResults);
  const setRequirementRules = useStore((s) => s.setRequirementRules);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [offer, setOffer] = useState<TemplateOffer | null>(null);
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const shared = useSharedTemplate(course);

  const results = useMemo(
    () => (rules ? allResults.filter((r) => r.courseId === courseId) : EMPTY_RESULTS),
    [allResults, courseId, rules]
  );

  const jsonDialog = (
    <Dialog open={jsonOpen} onClose={() => setJsonOpen(false)} title="Pontozási szabályok (JSON)" size="lg">
      <RulesJsonForm
        initial={rules ? JSON.stringify(subjectRulesOf(rules), null, 2) : ""}
        onSubmit={(next) => {
          setRequirementRules(courseId, { ...next, source: "manual" });
          setJsonOpen(false);
        }}
        onCancel={() => setJsonOpen(false)}
      />
    </Dialog>
  );
  const extractDialog = (
    <Dialog open={extractOpen} onClose={() => setExtractOpen(false)} title="Beolvasás a követelményrendszerből" size="lg">
      <ExtractForm
        replacing={!!rules}
        canShare={shared.canShare}
        onSave={(next, share) => {
          setRequirementRules(courseId, { ...next, source: "extracted" });
          if (share) shared.publish(next);
          setExtractOpen(false);
        }}
        onManual={() => {
          setExtractOpen(false);
          setJsonOpen(true);
        }}
        onCancel={() => setExtractOpen(false)}
      />
    </Dialog>
  );
  const templateDialog = (
    <Dialog open={offer !== null} onClose={() => setOffer(null)} title="Közösségi sablon" size="lg">
      {offer && (
        <TemplateReview
          offer={offer}
          onSave={() => {
            setRequirementRules(courseId, { ...offer.rules, source: "template", templateId: `shared:${offer.variantId}` });
            shared.publish(offer.rules);
            setOffer(null);
          }}
          onReport={() => {
            void shared.report(offer);
            setOffer(null);
            setExtractOpen(true);
          }}
          onCancel={() => setOffer(null)}
        />
      )}
    </Dialog>
  );
  const dialogs = (
    <>
      {jsonDialog}
      {extractDialog}
      {templateDialog}
    </>
  );

  if (!rules) {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-3.5">
        <div>
          <p className="text-[14px] font-semibold text-heading">Pontozás és jegyszámítás</p>
          <p className="mt-0.5 text-[13px] text-muted">
            Állítsd be a tárgy szabályait, és a rögzített eredményeidből kiszámoljuk, hol állsz és mi kell a jegyhez.
          </p>
        </div>
        {course && <SharedTemplateOffer course={course} shared={shared} onReview={setOffer} />}
        <Button type="button" size="sm" onClick={() => setExtractOpen(true)} className="self-start">
          <FileText className="h-4 w-4" />
          Beolvasás a követelményrendszerből
        </Button>
        <TemplatePicker
          onPick={(id) => {
            const template = ruleTemplate(id);
            if (template) setRequirementRules(courseId, { ...template.rules, source: "template", templateId: id });
          }}
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => setJsonOpen(true)} className="self-start">
          <Code className="h-4 w-4" />
          Saját szabályok (JSON)
        </Button>
        {dialogs}
      </div>
    );
  }

  return (
    <RulesView
      courseId={courseId}
      rules={rules}
      results={results}
      onEditJson={() => setJsonOpen(true)}
      onExtract={() => setExtractOpen(true)}
      dialogs={dialogs}
    />
  );
}

function TemplatePicker({ onPick }: { onPick: (id: string) => void }) {
  const [picked, setPicked] = useState(RULE_TEMPLATES[0]?.id ?? "");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <Label htmlFor="rules-template">Sablon</Label>
        <Select id="rules-template" value={picked} onChange={(e) => setPicked(e.target.value)}>
          {RULE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.university})
            </option>
          ))}
        </Select>
      </div>
      <Button type="button" size="sm" onClick={() => onPick(picked)} disabled={!picked}>
        Sablon használata
      </Button>
    </div>
  );
}

function RulesView({
  courseId,
  rules,
  results,
  onEditJson,
  onExtract,
  dialogs,
}: {
  courseId: string;
  rules: RequirementRules;
  results: RequirementResult[];
  onEditJson: () => void;
  onExtract: () => void;
  dialogs: React.ReactNode;
}) {
  const setRequirementRules = useStore((s) => s.setRequirementRules);
  const set = useResultSetter(courseId);
  const evaluation = useMemo(() => evaluate(rules, results, new Date()), [rules, results]);
  const template = rules.templateId ? ruleTemplate(rules.templateId) : undefined;
  const openFlags = rules.flags.filter((f) => !f.resolved);

  const byComponent = useMemo(() => {
    const map = new Map<string, RequirementResult[]>();
    for (const r of results) map.set(r.componentId, [...(map.get(r.componentId) ?? []), r]);
    return map;
  }, [results]);
  const resultsOf = (id: string) => byComponent.get(id) ?? EMPTY_RESULTS;
  const labelOf = (id: string) =>
    rules.components.find((c) => c.id === id)?.label ?? rules.retakes.find((r) => r.id === id)?.label ?? id;

  function resolveFlag(index: number) {
    const flags = rules.flags.map((f, i) => (i === index ? { ...f, resolved: true } : f));
    setRequirementRules(courseId, { ...subjectRulesOf(rules), flags, source: rules.source, templateId: rules.templateId });
  }

  function removeRules() {
    if (confirm("Biztosan törlöd a pontozási szabályokat? A rögzített eredményeid megmaradnak.")) {
      setRequirementRules(courseId, null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {evaluation.outcomes.map((o) => (
          <OutcomeCard key={o.outcomeId} outcome={o} />
        ))}
      </div>

      {openFlags.length > 0 && (
        <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
          <p className="text-[14px] font-semibold text-heading">Ellenőrizd</p>
          <p className="mt-0.5 text-[13px] text-muted">
            Ezeket a szabályokat feltételeztük. Vesd össze a követelményrendszerrel.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {rules.flags.map((f, i) =>
              f.resolved ? null : (
                <li key={`${f.field}-${i}`} className="flex items-start gap-2 text-[13.5px]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 text-foreground">{f.message}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => resolveFlag(i)}>
                    Rendben
                  </Button>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-1.5">
        <div className="divide-y divide-border">
          {rules.components.map((c) => {
            const rs = resultsOf(c.id);
            switch (c.kind) {
              case "exam":
                return <ExamInput key={c.id} component={c} results={rs} set={set} />;
              case "assignment":
                return <AssignmentInput key={c.id} component={c} results={rs} set={set} />;
              case "series":
                return <SeriesInput key={c.id} component={c} results={rs} set={set} />;
              case "attendance":
                return <AttendanceInput key={c.id} component={c} results={rs} set={set} />;
              case "bonus":
                return <BonusInput key={c.id} component={c} results={rs} set={set} />;
            }
          })}
          {rules.retakes.map((slot) => {
            const first = rules.components.find((c) => c.id === slot.targets[0]);
            if (!first || first.kind !== "exam") return null;
            return (
              <RetakeInput
                key={slot.id}
                slot={slot}
                scale={first.scale}
                targets={slot.targets.map((id) => ({ id, label: labelOf(id) }))}
                results={resultsOf(slot.id)}
                set={set}
              />
            );
          })}
        </div>
      </div>

      <Solver rules={rules} results={results} labelOf={labelOf} />

      {evaluation.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-muted">
          {evaluation.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="text-[12.5px] text-muted-dim">
        A hivatalos jegyet az oktató adja; ez a számítás a beállított szabályokból és a rögzített eredményeidből készül.
        {template && ` Sablon: ${template.name} (${template.university}).`}
        {rules.source === "extracted" && " A szabályokat a beillesztett követelményrendszerből olvastuk ki."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onEditJson}>
          <Code className="h-4 w-4" />
          Szabályok szerkesztése
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onExtract}>
          <FileText className="h-4 w-4" />
          Újraolvasás szövegből
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={removeRules}>
          <Trash2 className="h-4 w-4" />
          Szabályok törlése
        </Button>
      </div>
      {dialogs}
    </div>
  );
}

function OutcomeCard({ outcome }: { outcome: OutcomeEval }) {
  const range =
    outcome.best === outcome.worst ? gradeText(outcome.best) : `${gradeText(outcome.worst)} – ${gradeText(outcome.best)}`;
  const shown = outcome.status === "final" ? gradeText(outcome.current) : range;
  const unmet = outcome.gates.filter((g) => g.status !== "met");
  return (
    <div className="sheet-paper flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold text-heading">{outcome.label}</p>
        <Pill active={outcome.status === "final"} className="!h-6 shrink-0 !px-2 !text-[12px]">
          {STATUS_TEXT[outcome.status]}
        </Pill>
      </div>
      <p className="font-display text-[28px] leading-none tabular-nums text-heading">{shown}</p>
      <p className="text-[12.5px] text-muted">
        {outcome.status === "final"
          ? "Már nem változhat."
          : outcome.status === "provisional"
            ? `A mostani eredményekkel: ${gradeText(outcome.current)}`
            : "Még nincs elég eredmény a jegyhez."}
      </p>
      {outcome.gates.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {(unmet.length > 0 ? unmet : outcome.gates).map((g) => (
            <li key={`${g.pathId ?? ""}-${g.id}`} className="flex items-start gap-1.5">
              <GateIcon status={g.status} />
              <span className={g.status === "failed" || g.status === "fixable" ? "text-danger" : "text-foreground"}>
                {g.label}: {GATE_TEXT[g.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {outcome.applied.length > 0 && (
        <p className="text-[12.5px] text-muted">Beszámítva: {outcome.applied.join(", ")}</p>
      )}
    </div>
  );
}

const pointsText = (n: number) => String(n).replace(".", ",");

const SERIES_UNIT: Record<Unit, string> = { points: "pont", plusMinus: "plusz", percent: "teljesített kvíz", grade: "" };

type Unit = "grade" | "points" | "plusMinus" | "percent";

function scaleUnit(scale: Scale | undefined): Unit {
  return scale?.kind === "grade" ? "grade" : "points";
}

function Solver({
  rules,
  results,
  labelOf,
}: {
  rules: SubjectRules;
  results: RequirementResult[];
  labelOf: (id: string) => string;
}) {
  // Only what is still ahead: an exam or retake without a result, a series with items left.
  const targets = useMemo(() => {
    const recorded = (id: string) => results.filter((r) => r.componentId === id && r.state !== "pending").length;
    const list: { id: string; kind: "exam" | "retake" | "series"; unit: Unit }[] = [];
    for (const c of rules.components) {
      if (c.kind === "exam" && recorded(c.id) === 0) list.push({ id: c.id, kind: "exam", unit: scaleUnit(c.scale) });
      if (c.kind === "series" && recorded(c.id) < c.count) list.push({ id: c.id, kind: "series", unit: c.scoring.kind });
    }
    for (const r of rules.retakes) {
      const first = rules.components.find((c) => c.id === r.targets[0]);
      if (recorded(r.id) === 0) {
        list.push({ id: r.id, kind: "retake", unit: scaleUnit(first?.kind === "exam" ? first.scale : undefined) });
      }
    }
    return list;
  }, [rules, results]);

  const [outcomeId, setOutcomeId] = useState(rules.outcomes[0]?.id ?? "");
  const [goal, setGoal] = useState(2);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [others, setOthers] = useState<"worst" | "best">("worst");

  const effectiveOutcome = rules.outcomes.some((o) => o.id === outcomeId) ? outcomeId : (rules.outcomes[0]?.id ?? "");
  const effectiveTarget = targets.some((t) => t.id === target) ? target : (targets[0]?.id ?? "");
  const answer: SolveResult | null = useMemo(() => {
    if (!effectiveOutcome || !effectiveTarget) return null;
    return solveFor(rules, results, new Date(), { outcomeId: effectiveOutcome, goal, target: effectiveTarget, others });
  }, [rules, results, effectiveOutcome, goal, effectiveTarget, others]);

  if (targets.length === 0 || rules.outcomes.length === 0) return null;
  const targetInfo = targets.find((t) => t.id === effectiveTarget);
  const outcomeLabel = rules.outcomes.find((o) => o.id === effectiveOutcome)?.label ?? "";

  let text = "";
  if (answer && targetInfo) {
    if (answer.status === "already") text = `A ${goal}-es ${outcomeLabel.toLowerCase()} már megvan, ettől függetlenül.`;
    else if (answer.status === "unreachable") text = answer.reason ?? `A ${goal}-es így már nem érhető el.`;
    else if (answer.min !== undefined) {
      const need =
        targetInfo.kind === "series"
          ? `még legalább ${pointsText(answer.min)} ${SERIES_UNIT[targetInfo.unit]} kell a hátralévőkből`
          : targetInfo.unit === "grade"
            ? `legalább ${answer.min}-es kell`
            : `legalább ${pointsText(answer.min)} pont kell`;
      const via = answer.viaRetake ? ` (${labelOf(answer.viaRetake)} megírásával)` : "";
      text = `${labelOf(effectiveTarget)}: ${need}${via}.`;
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-3.5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-heading">
        <Calculator className="h-4 w-4 text-muted" aria-hidden />
        Mi kell a jegyhez?
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label htmlFor="solve-outcome">Jegy</Label>
          <Select id="solve-outcome" value={effectiveOutcome} onChange={(e) => setOutcomeId(e.target.value)}>
            {rules.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="solve-goal">Cél</Label>
          <Select id="solve-goal" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {[2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                legalább {g}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="solve-target">Ebből</Label>
          <Select id="solve-target" value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {labelOf(t.id)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill active={others === "worst"} onClick={() => setOthers("worst")}>
          Biztosan
        </Pill>
        <Pill active={others === "best"} onClick={() => setOthers("best")}>
          Ha a többi is jól megy
        </Pill>
      </div>
      {text && <p className="text-[14px] text-foreground" aria-live="polite">{text}</p>}
    </div>
  );
}

function RulesJsonForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (rules: SubjectRules) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setErrors(["Ez nem érvényes JSON."]);
      return;
    }
    const result = validateRules(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.rules);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="rules-json">Szabályok</Label>
        <Textarea
          id="rules-json"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={18}
          spellCheck={false}
          className="font-mono text-[12.5px]"
          placeholder='{ "schemaVersion": 1, "components": [], "retakes": [], "derived": [], "tables": [], "outcomes": [], "flags": [] }'
        />
        {errors.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-danger" role="alert">
            {errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 8 && <li>…és még {errors.length - 8} hiba.</li>}
          </ul>
        )}
      </div>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Mégse
        </Button>
        <Button type="submit">Mentés</Button>
      </DialogActions>
    </form>
  );
}
