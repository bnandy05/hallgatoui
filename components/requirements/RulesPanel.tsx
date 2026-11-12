"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, Code, FileText, Pencil, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { flagText } from "@/lib/rules/flags";
import { getMessages, type Locale } from "@/lib/i18n";
import { evaluate, type ComponentEval, type GradeValue, type OutcomeEval } from "@/lib/rules/engine";
import { RULE_TEMPLATES, ruleTemplate } from "@/lib/rules/fixtures";
import { solveFor, type SolveResult } from "@/lib/rules/solve";
import type { RequirementResult, RequirementRules, RetakeSlot, RuleComponent, Scale, SubjectRules } from "@/lib/rules/types";
import { validateRules } from "@/lib/rules/validate";
import { Badge } from "@/components/ui/Badge";
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
  attendanceSummary,
  BonusInput,
  bonusSummary,
  ExamInput,
  formatNumber,
  RetakeInput,
  scaleHint,
  SeriesInput,
  seriesSummary,
  useResultSetter,
} from "@/components/requirements/ResultInputs";
import { LinkedComponent } from "@/components/requirements/LinkedComponent";
import { RulesBreakdown } from "@/components/requirements/RulesBreakdown";
import { GateIcon } from "@/components/requirements/GateIcon";
import { useConfirm } from "@/components/ui/ConfirmDialog";

// The checked part of the requirements: a rule set (from a template, read from the document or
// written as JSON), the student's results against it, the standing of every grade, "what do I
// need" answers and the rules read back. Everything below is generated from the rules, so any
// valid rule set lays out the same way.

const EMPTY_RESULTS: RequirementResult[] = [];

/** The rule set without its storage fields, as edited and validated. */
function subjectRulesOf(rules: RequirementRules): SubjectRules {
  const { schemaVersion, components, retakes, derived, tables, outcomes, flags } = rules;
  return { schemaVersion, components, retakes, derived, tables, outcomes, flags };
}

const rulesJson = (rules: SubjectRules) => JSON.stringify(rules, null, 2);

/** The rules sheet: reading from the document, or the JSON, as two steps of one dialog. */
type RulesView = "extract" | "json";

export function RulesPanel({ courseId }: { courseId: string }) {
  const t = useT().rulesPanel;
  const rules = useStore((s) => s.requirementRules.find((r) => r.courseId === courseId));
  const allResults = useStore((s) => s.requirementResults);
  const setRequirementRules = useStore((s) => s.setRequirementRules);
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const shared = useSharedTemplate(course);
  const { confirm: ask, dialog: confirmDialog } = useConfirm();

  const [view, setView] = useState<RulesView | null>(null);
  // The reading stays mounted while the JSON is on show, so "Vissza" finds it as it was left.
  const [extractMounted, setExtractMounted] = useState(false);
  const [extractWide, setExtractWide] = useState(false);
  const [extractEmpty, setExtractEmpty] = useState(false);
  const [extractDirty, setExtractDirty] = useState(false);
  const [json, setJson] = useState<{ initial: string; back: boolean; fromForm: boolean } | null>(null);
  const [jsonDirty, setJsonDirty] = useState(false);
  const [offer, setOffer] = useState<TemplateOffer | null>(null);

  const results = useMemo(
    () => (rules ? allResults.filter((r) => r.courseId === courseId) : EMPTY_RESULTS),
    [allResults, courseId, rules]
  );

  function closeAll() {
    setView(null);
    setExtractMounted(false);
    setExtractWide(false);
    setExtractEmpty(false);
    setExtractDirty(false);
    setJson(null);
    setJsonDirty(false);
  }

  /** Esc, the backdrop and the close button: ask first when a reading or an edit would be lost. */
  async function requestClose() {
    const losing = (extractMounted && extractDirty) || (view === "json" && jsonDirty);
    if (losing) {
      const ok = await ask({
        title: t.discardTitle,
        message: extractDirty ? t.discardExtract : t.discardJson,
        confirmLabel: t.discard,
      });
      if (!ok) return;
    }
    closeAll();
  }

  function openExtract(empty = false) {
    setExtractEmpty(empty);
    setExtractMounted(true);
    setView("extract");
  }

  function openJson(initial: SubjectRules | undefined, back: boolean) {
    const base = initial ?? (rules ? subjectRulesOf(rules) : undefined);
    setJson({ initial: base ? rulesJson(base) : "", back, fromForm: back && initial !== undefined });
    setJsonDirty(false);
    setView("json");
  }

  function save(next: SubjectRules, source: RequirementRules["source"]) {
    setRequirementRules(courseId, { ...next, source });
    closeAll();
  }

  const title = view === "json" ? t.jsonTitle : extractWide ? (extractEmpty ? t.manualTitle : t.reviewTitle) : t.extractTitle;

  const rulesDialog = (
    <Dialog
      open={view !== null}
      onClose={requestClose}
      title={title}
      size={extractMounted && extractWide ? "xl" : "lg"}
      view={view ?? undefined}
    >
      {extractMounted && (
        <div hidden={view !== "extract"}>
          <ExtractForm
            course={{ name: course?.name ?? t.courseFallback, ...(course?.code ? { code: course.code } : {}) }}
            replacing={!!rules}
            canShare={shared.canShare}
            onSave={(next, share) => {
              if (share) shared.publish(next);
              save(next, "extracted");
            }}
            onManual={(built) => openJson(built, true)}
            onCancel={requestClose}
            onWide={setExtractWide}
            onDirty={setExtractDirty}
            startEmpty={extractEmpty}
          />
        </div>
      )}
      {view === "json" && json && (
        <RulesJsonForm
          initial={json.initial}
          note={json.fromForm ? t.jsonFromForm : undefined}
          back={json.back}
          onDirty={setJsonDirty}
          onSubmit={(next) => save(next, "manual")}
          onCancel={() => (json.back ? setView("extract") : requestClose())}
        />
      )}
    </Dialog>
  );

  const templateDialog = (
    <Dialog open={offer !== null} onClose={() => setOffer(null)} title={t.sharedTemplate} size="lg">
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
            openExtract();
          }}
          onCancel={() => setOffer(null)}
        />
      )}
    </Dialog>
  );

  const dialogs = (
    <>
      {rulesDialog}
      {templateDialog}
      {confirmDialog}
    </>
  );

  if (!rules) {
    return (
      <div className="sheet-paper flex flex-col px-5 py-5 sm:px-6">
        <h3 className="font-display text-subhead text-heading">{t.heading}</h3>
        <p className="mt-1.5 max-w-[62ch] text-body text-muted">{t.intro}</p>
        {course && (
          <div className="mt-4 empty:hidden">
            <SharedTemplateOffer course={course} shared={shared} onReview={setOffer} />
          </div>
        )}
        <div className="mt-4 flex flex-col">
          <SetupRow title={t.fromDocTitle} text={t.fromDocText}>
            <Button type="button" onClick={() => openExtract()}>
              <FileText className="h-4 w-4" aria-hidden />
              {t.read}
            </Button>
          </SetupRow>
          <SetupRow title={t.templateTitle} text={t.templateText}>
            <TemplatePicker
              onPick={(id) => {
                const template = ruleTemplate(id);
                if (template) setRequirementRules(courseId, { ...template.rules, source: "template", templateId: id });
              }}
            />
          </SetupRow>
          <SetupRow title={t.manualTitle} text={t.manualText}>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => openExtract(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                {t.fillByHand}
              </Button>
              <Button type="button" variant="ghost" onClick={() => openJson(undefined, false)}>
                <Code className="h-4 w-4" aria-hidden />
                {t.ownRules}
              </Button>
            </div>
          </SetupRow>
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <RulesView
      courseId={courseId}
      rules={rules}
      results={results}
      onEditJson={() => openJson(undefined, false)}
      onExtract={() => openExtract()}
      dialogs={dialogs}
    />
  );
}

/** One way to set the rules up: what it is on the left, its control on the right. */
function SetupRow({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border py-4 last:pb-0">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-lead font-semibold text-heading">{title}</p>
        <p className="mt-0.5 text-small text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}

function TemplatePicker({ onPick }: { onPick: (id: string) => void }) {
  const t = useT().rulesPanel;
  const [picked, setPicked] = useState(RULE_TEMPLATES[0]?.id ?? "");
  return (
    <div className="flex w-full min-w-0 gap-2 sm:w-auto">
      <Select aria-label={t.templateLabel} value={picked} onChange={(e) => setPicked(e.target.value)} className="min-w-0 flex-1 sm:!w-64">
        {RULE_TEMPLATES.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name} ({tpl.university})
          </option>
        ))}
      </Select>
      <Button type="button" variant="secondary" onClick={() => onPick(picked)} disabled={!picked}>
        {t.useTemplate}
      </Button>
    </div>
  );
}

// ----- the rules on the course page -----

type LedgerGroup = { id: string; title: string; items: ReactNode[] };

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
  dialogs: ReactNode;
}) {
  const tAll = useT();
  const t = tAll.rulesPanel;
  const locale = useLocale();
  const { confirm: ask, dialog: confirmDialog } = useConfirm();
  const setRequirementRules = useStore((s) => s.setRequirementRules);
  const set = useResultSetter(courseId);
  const evaluation = useMemo(() => evaluate(rules, results, new Date(), locale), [rules, results, locale]);
  const template = rules.templateId ? ruleTemplate(rules.templateId) : undefined;
  const openFlags = rules.flags.filter((f) => !f.resolved);

  const byComponent = useMemo(() => {
    const map = new Map<string, RequirementResult[]>();
    for (const r of results) map.set(r.componentId, [...(map.get(r.componentId) ?? []), r]);
    return map;
  }, [results]);
  const evals = useMemo(() => new Map(evaluation.components.map((c) => [c.id, c])), [evaluation]);
  const resultsOf = (id: string) => byComponent.get(id) ?? EMPTY_RESULTS;
  const labelOf = (id: string) =>
    rules.components.find((c) => c.id === id)?.label ?? rules.retakes.find((r) => r.id === id)?.label ?? id;

  function resolveFlag(index: number) {
    const flags = rules.flags.map((f, i) => (i === index ? { ...f, resolved: true } : f));
    setRequirementRules(courseId, { ...subjectRulesOf(rules), flags, source: rules.source, templateId: rules.templateId });
  }

  async function removeRules() {
    if (await ask({ title: t.removeTitle, message: t.removeMessage, confirmLabel: tAll.common.delete })) {
      setRequirementRules(courseId, null);
    }
  }

  function componentRow(c: RuleComponent): ReactNode {
    const rs = resultsOf(c.id);
    const e = evals.get(c.id);
    const common = { courseId, target: c, link: rules.calendarLinks?.[c.id], results: rs, labelOf };
    switch (c.kind) {
      case "exam": {
        const parts = c.scale.kind === "points" && !!c.scale.parts?.length;
        const replaced = e?.replacedBy && e.effective !== undefined && e.effective !== e.points;
        return (
          <LinkedComponent
            key={c.id}
            {...common}
            meta={
              <>
                {scaleHint(c.scale, locale)}
                {replaced && ` · ${t.credited(formatNumber(e!.effective, locale))}`}
              </>
            }
            status={<ComponentStatus e={e} labelOf={labelOf} />}
            block={parts}
            summary={parts && e?.points !== undefined ? t.pointsOfMax(formatNumber(e.points, locale), formatNumber(e.maxTotal, locale)) : undefined}
          >
            <ExamInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
      }
      case "assignment":
        return (
          <LinkedComponent
            key={c.id}
            {...common}
            meta={t.maxPoints(formatNumber(Math.max(0, ...c.outcomes.map((o) => o.points)), locale))}
            status={<ComponentStatus e={e} labelOf={labelOf} />}
          >
            <AssignmentInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
      case "series":
        return (
          <LinkedComponent key={c.id} {...common} meta={seriesMeta(c, locale)} summary={seriesSummary(c, rs, locale)} block>
            <SeriesInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
      case "attendance": {
        const s = attendanceSummary(c, rs, locale);
        return (
          <LinkedComponent
            key={c.id}
            {...common}
            meta={
              c.limit ? t.absencesLimit(c.limit.maxAbsences, c.limit.countExcused) : t.recordAbsences
            }
            summary={<span className={s.over ? "font-semibold text-danger" : ""}>{s.text}</span>}
            block
          >
            <AttendanceInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
      }
      case "bonus":
        return (
          <LinkedComponent
            key={c.id}
            {...common}
            meta={c.cap !== undefined ? t.bonusCap(formatNumber(c.cap, locale)) : t.bonusPlain}
            summary={bonusSummary(c, rs, locale)}
            block
          >
            <BonusInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
    }
  }

  function retakeRow(slot: RetakeSlot): ReactNode {
    const first = rules.components.find((c) => c.id === slot.targets[0]);
    if (!first || first.kind !== "exam") return null;
    const rs = resultsOf(slot.id);
    return (
      <LinkedComponent
        key={slot.id}
        courseId={courseId}
        target={{ ...slot, kind: "retake" }}
        scale={first.scale}
        link={rules.calendarLinks?.[slot.id]}
        results={rs}
        labelOf={labelOf}
        meta={retakeMeta(slot, first.scale, labelOf, locale)}
        status={<ComponentStatus e={evals.get(slot.id)} labelOf={labelOf} />}
        block={slot.pick === "choose" || (first.scale.kind === "points" && !!first.scale.parts?.length)}
      >
        <RetakeInput
          slot={slot}
          scale={first.scale}
          targets={slot.targets.map((id) => ({ id, label: labelOf(id) }))}
          results={rs}
          set={set}
        />
      </LinkedComponent>
    );
  }

  // The ledger, grouped by kind: what is written, what is handed in, the small items, presence.
  const groups: LedgerGroup[] = [];
  const of = <K extends RuleComponent["kind"]>(kind: K) => rules.components.filter((c): c is Extract<RuleComponent, { kind: K }> => c.kind === kind);
  const exams = [...of("exam").map(componentRow), ...rules.retakes.map(retakeRow)].filter(Boolean);
  if (exams.length) groups.push({ id: "exam", title: t.groupExams, items: exams });
  const assignments = of("assignment");
  if (assignments.length) groups.push({ id: "assignment", title: t.groupAssignments, items: assignments.map(componentRow) });
  const series = of("series");
  if (series.length) {
    const kinds = new Set(series.map((s) => s.item));
    groups.push({ id: "series", title: kinds.size === 1 ? (series[0].item === "ropzh" ? t.groupRopzh : t.groupQuizzes) : t.groupRopzhQuizzes, items: series.map(componentRow) });
  }
  const presence = [...of("attendance"), ...of("bonus")];
  if (presence.length) {
    const title = of("attendance").length && of("bonus").length ? t.groupPresenceBonus : of("attendance").length ? t.groupPresence : t.groupBonus;
    groups.push({ id: "presence", title, items: presence.map(componentRow) });
  }

  const counted = evaluation.components.filter((c) => c.kind === "exam" || c.kind === "assignment" || c.kind === "series");
  const recorded = counted.reduce((n, c) => n + c.recorded + c.na, 0);
  const total = counted.reduce((n, c) => n + c.total, 0);

  const source = template
    ? t.sourceTemplate(template.name, template.university)
    : rules.source === "extracted"
      ? t.sourceExtracted
      : rules.templateId?.startsWith("shared:")
        ? t.sourceShared
        : t.sourceOwn;

  return (
    <div className="@container flex flex-col gap-4">
      <Standing outcomes={evaluation.outcomes} />

      {openFlags.length > 0 && (
        <div className="slip bg-canary px-4 py-3 sm:px-5">
          <p className="flex items-start gap-2 text-body font-semibold leading-snug text-heading">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {t.flagsTitle} <span className="whitespace-nowrap font-normal text-heading/75">· {t.flagsCount(openFlags.length)}</span>
            </span>
          </p>
          <ul className="mt-1.5 flex flex-col">
            {rules.flags.map((f, i) =>
              f.resolved ? null : (
                <li
                  key={`${f.field}-${i}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-heading/15 py-1.5 text-small leading-snug first:border-t-0"
                >
                  <span className="text-heading">{flagText(f, locale)}</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => resolveFlag(i)}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {t.flagOk}
                  </Button>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <section className="sheet-paper px-5 pb-2 pt-4 sm:px-6" aria-labelledby={`ledger-${courseId}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id={`ledger-${courseId}`} className="font-display text-subhead text-heading">
            {t.ledger}
          </h3>
          {total > 0 && (
            <p className="text-small tabular-nums text-muted">
              <span className="font-semibold text-heading">{recorded}</span>
              {t.recordedOf(total)}
            </p>
          )}
        </div>
        <p className="mt-0.5 text-small text-muted">{t.ledgerHint}</p>
        {groups.map((g) => (
          <div key={g.id} className="mt-4">
            {groups.length > 1 && <h4 className="pb-1.5 text-small font-semibold text-muted">{g.title}</h4>}
            <ul className="grid grid-cols-1 @2xl:grid-cols-2 @2xl:gap-x-8">{g.items}</ul>
          </div>
        ))}
      </section>

      <Solver rules={rules} results={results} labelOf={labelOf} />

      <RulesBreakdown
        rules={rules}
        evaluation={evaluation}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-fine text-muted">{source}</p>
            <div className="-mr-2 flex flex-wrap gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onEditJson}>
                <Code className="h-4 w-4" aria-hidden />
                {t.edit}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onExtract}>
                <FileText className="h-4 w-4" aria-hidden />
                {t.reread}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={removeRules}>
                <Trash2 className="h-4 w-4" aria-hidden />
                {tAll.common.delete}
              </Button>
            </div>
          </div>
        }
      />

      {evaluation.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-small text-muted">
          {evaluation.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      <p className="text-fine text-muted-dim">
        {t.disclaimer}
      </p>
      {dialogs}
      {confirmDialog}
    </div>
  );
}

function seriesMeta(c: Extract<RuleComponent, { kind: "series" }>, locale: Locale): string {
  const t = getMessages(locale).rulesPanel;
  const sc = c.scoring;
  if (sc.kind === "plusMinus") return t.seriesPlusMinus(c.count);
  if (sc.kind === "percent") return t.seriesPercent(c.count, sc.passAt, sc.attempts, !!sc.onTimeOnly);
  const parts = (sc.parts ?? []).map((p) => `${p.label.toLowerCase()} ${formatNumber(p.max, locale)}`);
  return t.seriesPoints(c.count, formatNumber(sc.max, locale), parts);
}

function retakeMeta(slot: RetakeSlot, scale: Scale, labelOf: (id: string) => string, locale: Locale): string {
  const t = getMessages(locale).rulesPanel;
  const targets = slot.targets.map(labelOf).join(", ");
  return `${targets}: ${t.retakePick[slot.pick]}${slot.mode === "ifBetter" ? t.retakeIfBetter : ""} · ${scaleHint(scale, locale)}`;
}

/** A stamp for what a component's results add up to so far. */
function ComponentStatus({ e, labelOf }: { e: ComponentEval | undefined; labelOf: (id: string) => string }) {
  const t = useT().rulesPanel;
  if (!e) return null;
  if (e.replacedBy) return <Badge color="var(--muted)">{t.replacedBy(labelOf(e.replacedBy))}</Badge>;
  if (e.kind === "retake" && e.replaces) return <Badge color="var(--accent)">{t.insteadOf(labelOf(e.replaces))}</Badge>;
  if (e.status === "na") return <Badge color="var(--muted)">{t.statusCancelled}</Badge>;
  if (e.status === "passed") return <Badge color="var(--success)">{e.kind === "assignment" ? t.statusAccepted : t.statusPassed}</Badge>;
  if (e.status === "failed") return <Badge color="var(--danger)">{e.kind === "assignment" ? t.statusNotAccepted : t.statusFailed}</Badge>;
  if (e.overdueEntry) return <Badge color="var(--warning)">{t.statusAwaiting}</Badge>;
  return null;
}

// ----- standing -----

const STATUS_COLOR: Record<OutcomeEval["status"], string> = {
  final: "var(--success)",
  provisional: "var(--accent)",
  open: "var(--muted)",
};

/** Every grade on one sheet, side by side when there is room. */
function Standing({ outcomes }: { outcomes: OutcomeEval[] }) {
  const t = useT().rulesPanel;
  if (outcomes.length === 0) return null;
  return (
    <section aria-label={t.standing} className="sheet-paper overflow-hidden">
      <div className={`grid ${outcomes.length > 1 ? "@2xl:grid-cols-2" : ""}`}>
        {outcomes.map((o) => (
          <OutcomeStanding key={o.outcomeId} outcome={o} wide={outcomes.length === 1} />
        ))}
      </div>
    </section>
  );
}

function OutcomeStanding({ outcome, wide }: { outcome: OutcomeEval; wide: boolean }) {
  const tAll = useT();
  const t = tAll.rulesPanel;
  const gateText = tAll.rulesBreakdown.gate;
  const gradeWord = (g: number | null) => (g === null || g === 0 ? t.noGrade : String(g));
  const statusText = { final: t.outcomeFinal, provisional: t.outcomeProvisional, open: t.outcomeOpen }[outcome.status];
  const { status, current, best, worst } = outcome;
  const lo = Math.min(worst, best);
  const hi = Math.max(worst, best);
  const grades: GradeValue[] = [...(lo === 0 || current === 0 ? [0 as const] : []), 1, 2, 3, 4, 5];
  const unmet = outcome.gates.filter((g) => g.status !== "met");
  const gates = [...unmet, ...outcome.gates.filter((g) => g.status === "met")];

  const summary =
    status === "final"
      ? t.summaryFinal(gradeWord(current))
      : status === "provisional"
        ? lo === hi
          ? t.summarySame(gradeWord(current))
          : t.summaryBest(gradeWord(current), gradeWord(hi))
        : lo === hi
          ? t.summaryOpenSame(gradeWord(hi))
          : t.summaryOpenRange(gradeWord(lo), hi);

  return (
    <div
      className={`flex flex-col gap-3 border-t border-border px-5 py-4 first:border-t-0 sm:px-6 @2xl:border-t-0 @2xl:border-l @2xl:first:border-l-0 ${
        wide ? "@2xl:flex-row @2xl:items-start @2xl:gap-10" : ""
      }`}
    >
      <div className={`flex min-w-0 flex-col gap-2.5 ${wide ? "@2xl:w-[22rem] @2xl:shrink-0" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-lead font-bold text-heading">{outcome.label}</h4>
          <Badge color={STATUS_COLOR[status]}>{statusText}</Badge>
        </div>
        <ol className="grid grid-flow-col auto-cols-fr gap-1" aria-hidden>
          {grades.map((g) => {
            const isCurrent = current !== null && g === current;
            const reach = g >= lo && g <= hi;
            const failing = g <= 1;
            const cls = isCurrent
              ? status === "final"
                ? failing
                  ? "border-danger bg-danger text-accent-ink"
                  : "border-accent bg-accent text-accent-ink"
                : `border-2 ${failing ? "border-danger text-danger" : "border-accent text-heading"} bg-card`
              : reach
                ? "border-border-strong bg-card text-heading"
                : "border-transparent bg-inset text-muted-dim";
            return (
              <li key={g} className={`flex h-11 items-center justify-center rounded-[var(--radius-slip)] border ${cls}`}>
                <span className={`font-display tabular-nums leading-none ${g === 0 ? "text-small font-semibold tracking-normal" : "text-headline"}`}>
                  {g === 0 ? t.gradeNone : g}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-small leading-snug text-muted">{summary}</p>
      </div>
      {(gates.length > 0 || outcome.applied.length > 0) && (
        <div className="min-w-0 flex-1">
          {gates.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {gates.map((g) => (
                <li key={`${g.pathId ?? ""}-${g.id}`} className="flex items-start gap-2 text-small leading-snug">
                  <GateIcon status={g.status} />
                  <span className={g.status === "failed" || g.status === "fixable" ? "text-danger" : g.status === "met" ? "text-muted" : "text-foreground"}>
                    {g.label}
                    <span className="sr-only">: {gateText[g.status]}</span>
                    {g.status === "fixable" && <span className="text-fine">{t.fixable}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outcome.applied.length > 0 && (
            <p className="mt-1.5 text-fine text-muted">{t.applied(outcome.applied.join(", "))}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ----- "mi kell a jegyhez" -----

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
  const tAll = useT();
  const t = tAll.rulesPanel;
  const locale = useLocale();
  const seriesUnit: Record<Unit, string> = { points: t.unitPoints, plusMinus: t.unitPlusMinus, percent: t.unitPercent, grade: "" };
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
  const effectiveTarget = targets.some((x) => x.id === target) ? target : (targets[0]?.id ?? "");
  const answer: SolveResult | null = useMemo(() => {
    if (!effectiveOutcome || !effectiveTarget) return null;
    return solveFor(rules, results, new Date(), { outcomeId: effectiveOutcome, goal, target: effectiveTarget, others }, locale);
  }, [rules, results, effectiveOutcome, goal, effectiveTarget, others, locale]);

  if (targets.length === 0 || rules.outcomes.length === 0) return null;
  const targetInfo = targets.find((x) => x.id === effectiveTarget);
  const outcomeLabel = rules.outcomes.find((o) => o.id === effectiveOutcome)?.label ?? "";

  // The answer as a figure ("12 pont", "4-es") inside its sentence.
  let figure: string | null = null;
  let before = "";
  let after = "";
  if (answer && targetInfo) {
    if (answer.status === "already") before = t.alreadyThere(outcomeLabel, goal);
    else if (answer.status === "unreachable") before = answer.reason ?? t.unreachable(goal);
    else if (answer.min !== undefined) {
      const via = answer.viaRetake ? t.via(labelOf(answer.viaRetake)) : "";
      const series = targetInfo.kind === "series";
      before = t.need(labelOf(effectiveTarget), series);
      figure = series
        ? `${formatNumber(answer.min, locale)} ${seriesUnit[targetInfo.unit]}`
        : targetInfo.unit === "grade"
          ? t.figureGrade(answer.min)
          : t.figurePoints(formatNumber(answer.min, locale));
      after = t.needAfter(series, via);
    }
  }
  const tone = answer?.status === "unreachable" ? "bg-salmon" : answer?.status === "already" ? "bg-sky" : "bg-inset";

  return (
    <section className="sheet-paper flex flex-col gap-3 px-5 py-4 sm:px-6" aria-labelledby="solver-title">
      <h3 id="solver-title" className="font-display text-subhead text-heading">
        {t.solverTitle}
      </h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <Label htmlFor="solve-outcome">{t.solverGrade}</Label>
          <Select id="solve-outcome" value={effectiveOutcome} onChange={(e) => setOutcomeId(e.target.value)}>
            {rules.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="solve-goal">{t.solverGoal}</Label>
          <Select id="solve-goal" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {[2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {t.atLeast(g)}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
          <Label htmlFor="solve-target">{t.solverFrom}</Label>
          <Select id="solve-target" value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((x) => (
              <option key={x.id} value={x.id}>
                {labelOf(x.id)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.othersLabel}>
        <Pill active={others === "worst"} onClick={() => setOthers("worst")}>
          {t.othersWorst}
        </Pill>
        <Pill active={others === "best"} onClick={() => setOthers("best")}>
          {t.othersBest}
        </Pill>
      </div>
      {before && (
        <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--radius-slip)] px-4 py-3 text-body text-heading ${tone}`} aria-live="polite">
          <span>{before}</span>
          {figure && <span className="font-display text-headline leading-none tabular-nums">{figure}</span>}
          {after && <span>{after}</span>}
        </p>
      )}
    </section>
  );
}

// ----- the JSON -----

function RulesJsonForm({
  initial,
  note,
  back,
  onDirty,
  onSubmit,
  onCancel,
}: {
  initial: string;
  note?: string;
  /** Opened from the reading: the secondary button goes back to it. */
  back: boolean;
  onDirty: (dirty: boolean) => void;
  onSubmit: (rules: SubjectRules) => void;
  onCancel: () => void;
}) {
  const tAll = useT();
  const t = tAll.rulesPanel;
  const locale = useLocale();
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const dirty = value !== initial;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setErrors([t.jsonInvalid]);
      return;
    }
    const result = validateRules(parsed, locale);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.rules);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {note && <p className="text-body text-muted">{note}</p>}
      <div>
        <Label htmlFor="rules-json">{t.jsonLabel}</Label>
        <Textarea
          id="rules-json"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={18}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-mono text-fine! leading-relaxed max-sm:min-h-[45dvh]"
          placeholder='{ "schemaVersion": 1, "components": [], "retakes": [], "derived": [], "tables": [], "outcomes": [], "flags": [] }'
        />
        {errors.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-small text-danger" role="alert">
            {errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 8 && <li>{t.jsonMoreErrors(errors.length - 8)}</li>}
          </ul>
        )}
      </div>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {back && <ArrowLeft className="h-4 w-4" aria-hidden />}
          {back ? t.back : tAll.common.cancel}
        </Button>
        <Button type="submit">{tAll.common.save}</Button>
      </DialogActions>
    </form>
  );
}

