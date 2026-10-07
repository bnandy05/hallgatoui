"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, Code, FileText, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { evaluate, type ComponentEval, type GateStatus, type GradeValue, type OutcomeEval } from "@/lib/rules/engine";
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
  const rules = useStore((s) => s.requirementRules.find((r) => r.courseId === courseId));
  const allResults = useStore((s) => s.requirementResults);
  const setRequirementRules = useStore((s) => s.setRequirementRules);
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const shared = useSharedTemplate(course);
  const [confirmDialog, ask] = useConfirm();

  const [view, setView] = useState<RulesView | null>(null);
  // The reading stays mounted while the JSON is on show, so "Vissza" finds it as it was left.
  const [extractMounted, setExtractMounted] = useState(false);
  const [extractWide, setExtractWide] = useState(false);
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
    setExtractDirty(false);
    setJson(null);
    setJsonDirty(false);
  }

  /** Esc, the backdrop and the close button: ask first when a reading or an edit would be lost. */
  async function requestClose() {
    const losing = (extractMounted && extractDirty) || (view === "json" && jsonDirty);
    if (losing) {
      const ok = await ask({
        title: "Elveted a módosításokat?",
        message: extractDirty ? "Az átnézett űrlapot nem mentjük, a beolvasást újra kell kezdeni." : "A szerkesztett szabályokat nem mentjük.",
        confirmLabel: "Elvetés",
      });
      if (!ok) return;
    }
    closeAll();
  }

  function openExtract() {
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

  const title =
    view === "json" ? "Szabályok (JSON)" : extractWide ? "A beolvasás átnézése" : "Beolvasás a követelményrendszerből";

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
            course={{ name: course?.name ?? "Tárgy", ...(course?.code ? { code: course.code } : {}) }}
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
          />
        </div>
      )}
      {view === "json" && json && (
        <RulesJsonForm
          initial={json.initial}
          note={json.fromForm ? "Az űrlapból összeállított szabályok. Írd át, amit az űrlap nem tud, és mentsd." : undefined}
          back={json.back}
          onDirty={setJsonDirty}
          onSubmit={(next) => save(next, "manual")}
          onCancel={() => (json.back ? setView("extract") : requestClose())}
        />
      )}
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
        <h3 className="font-display text-[22px] text-heading">Pontozás és jegyszámítás</h3>
        <p className="mt-1.5 max-w-[62ch] text-[14px] text-muted">
          Állítsd be a tárgy szabályait, és a rögzített eredményeidből kiszámoljuk, hol állsz és mi kell a jegyhez.
        </p>
        {course && (
          <div className="mt-4 empty:hidden">
            <SharedTemplateOffer course={course} shared={shared} onReview={setOffer} />
          </div>
        )}
        <div className="mt-4 flex flex-col">
          <SetupRow
            title="A követelményrendszerből"
            text="Töltsd fel a PDF-et vagy illeszd be a szövegét. A Jev kitölt egy űrlapot, amit mentés előtt átnézel."
          >
            <Button type="button" onClick={openExtract}>
              <FileText className="h-4 w-4" aria-hidden />
              Beolvasás
            </Button>
          </SetupRow>
          <SetupRow title="Sablonból" text="Egy már beállított tárgy szabályai, a sajátodhoz igazítva.">
            <TemplatePicker
              onPick={(id) => {
                const template = ruleTemplate(id);
                if (template) setRequirementRules(courseId, { ...template.rules, source: "template", templateId: id });
              }}
            />
          </SetupRow>
          <SetupRow title="Kézzel" text="A szabályok JSON-ban, haladóknak.">
            <Button type="button" variant="secondary" onClick={() => openJson(undefined, false)}>
              <Code className="h-4 w-4" aria-hidden />
              Saját szabályok
            </Button>
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
      onExtract={openExtract}
      dialogs={dialogs}
    />
  );
}

/** One way to set the rules up: what it is on the left, its control on the right. */
function SetupRow({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border py-4 last:pb-0">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-[15px] font-semibold text-heading">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}

function TemplatePicker({ onPick }: { onPick: (id: string) => void }) {
  const [picked, setPicked] = useState(RULE_TEMPLATES[0]?.id ?? "");
  return (
    <div className="flex w-full min-w-0 gap-2 sm:w-auto">
      <Select aria-label="Sablon" value={picked} onChange={(e) => setPicked(e.target.value)} className="min-w-0 flex-1 sm:!w-64">
        {RULE_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.university})
          </option>
        ))}
      </Select>
      <Button type="button" variant="secondary" onClick={() => onPick(picked)} disabled={!picked}>
        Használom
      </Button>
    </div>
  );
}

// ----- the rules on the course page -----

type LedgerGroup = { id: string; title: string; items: ReactNode[] };

const SERIES_TITLE = { ropzh: "Röpzh-k", quiz: "Kvízek" } as const;

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
  const [confirmDialog, ask] = useConfirm();
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
  const evals = useMemo(() => new Map(evaluation.components.map((c) => [c.id, c])), [evaluation]);
  const resultsOf = (id: string) => byComponent.get(id) ?? EMPTY_RESULTS;
  const labelOf = (id: string) =>
    rules.components.find((c) => c.id === id)?.label ?? rules.retakes.find((r) => r.id === id)?.label ?? id;

  function resolveFlag(index: number) {
    const flags = rules.flags.map((f, i) => (i === index ? { ...f, resolved: true } : f));
    setRequirementRules(courseId, { ...subjectRulesOf(rules), flags, source: rules.source, templateId: rules.templateId });
  }

  async function removeRules() {
    if (await ask({ title: "Törlöd a pontozási szabályokat?", message: "A rögzített eredményeid megmaradnak.", confirmLabel: "Törlés" })) {
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
                {scaleHint(c.scale)}
                {replaced && ` · beszámít: ${formatNumber(e!.effective)}`}
              </>
            }
            status={<ComponentStatus e={e} labelOf={labelOf} />}
            block={parts}
            summary={parts && e?.points !== undefined ? `${formatNumber(e.points)} / ${formatNumber(e.maxTotal)} pont` : undefined}
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
            meta={`max. ${formatNumber(Math.max(0, ...c.outcomes.map((o) => o.points)))} pont`}
            status={<ComponentStatus e={e} labelOf={labelOf} />}
          >
            <AssignmentInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
      case "series":
        return (
          <LinkedComponent key={c.id} {...common} meta={seriesMeta(c)} summary={seriesSummary(c, rs)} block>
            <SeriesInput component={c} results={rs} set={set} />
          </LinkedComponent>
        );
      case "attendance": {
        const s = attendanceSummary(c, rs);
        return (
          <LinkedComponent
            key={c.id}
            {...common}
            meta={
              c.limit
                ? `legfeljebb ${c.limit.maxAbsences} hiányzás, ${c.limit.countExcused ? "az igazolt is számít" : "csak az igazolatlan számít"}`
                : "a hiányzásaidat rögzítsd"
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
            meta={c.cap !== undefined ? `legfeljebb ${formatNumber(c.cap)} pont számít` : "pluszpontok"}
            summary={bonusSummary(c, rs)}
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
        meta={retakeMeta(slot, first.scale, labelOf)}
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
  if (exams.length) groups.push({ id: "exam", title: "Zh-k és vizsgák", items: exams });
  const assignments = of("assignment");
  if (assignments.length) groups.push({ id: "assignment", title: "Beadandók", items: assignments.map(componentRow) });
  const series = of("series");
  if (series.length) {
    const kinds = new Set(series.map((s) => s.item));
    groups.push({ id: "series", title: kinds.size === 1 ? SERIES_TITLE[series[0].item] : "Röpzh-k és kvízek", items: series.map(componentRow) });
  }
  const presence = [...of("attendance"), ...of("bonus")];
  if (presence.length) {
    const title = of("attendance").length && of("bonus").length ? "Jelenlét és bónusz" : of("attendance").length ? "Jelenlét" : "Bónusz";
    groups.push({ id: "presence", title, items: presence.map(componentRow) });
  }

  const counted = evaluation.components.filter((c) => c.kind === "exam" || c.kind === "assignment" || c.kind === "series");
  const recorded = counted.reduce((n, c) => n + c.recorded + c.na, 0);
  const total = counted.reduce((n, c) => n + c.total, 0);

  const source = template
    ? `Sablon: ${template.name} (${template.university})`
    : rules.source === "extracted"
      ? "A követelményrendszerből olvastuk ki"
      : rules.templateId?.startsWith("shared:")
        ? "Közösségi sablon"
        : "Saját szabályok";

  return (
    <div className="@container flex flex-col gap-4">
      <Standing outcomes={evaluation.outcomes} />

      {openFlags.length > 0 && (
        <div className="slip bg-canary px-4 py-3 sm:px-5">
          <p className="flex items-start gap-2 text-[14px] font-semibold leading-snug text-heading">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Ellenőrizd a követelményrendszerrel <span className="whitespace-nowrap font-normal text-heading/75">· {openFlags.length} feltételezés</span>
            </span>
          </p>
          <ul className="mt-1.5 flex flex-col">
            {rules.flags.map((f, i) =>
              f.resolved ? null : (
                <li
                  key={`${f.field}-${i}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-heading/15 py-1.5 text-[13.5px] leading-snug first:border-t-0"
                >
                  <span className="text-heading">{f.message}</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => resolveFlag(i)}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Rendben
                  </Button>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <section className="sheet-paper px-5 pb-2 pt-4 sm:px-6" aria-labelledby={`ledger-${courseId}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id={`ledger-${courseId}`} className="font-display text-[22px] text-heading">
            Eredményeid
          </h3>
          {total > 0 && (
            <p className="text-[13px] tabular-nums text-muted">
              <span className="font-semibold text-heading">{recorded}</span> / {total} rögzítve
            </p>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-muted">Írd be, amit már megkaptál; a jegyed ezekből számoljuk.</p>
        {groups.map((g) => (
          <div key={g.id} className="mt-4">
            {groups.length > 1 && <h4 className="pb-1.5 text-[13px] font-semibold text-muted">{g.title}</h4>}
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
            <p className="text-[12.5px] text-muted">{source}</p>
            <div className="-mr-2 flex flex-wrap gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onEditJson}>
                <Code className="h-4 w-4" aria-hidden />
                Szerkesztés
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onExtract}>
                <FileText className="h-4 w-4" aria-hidden />
                Újraolvasás
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={removeRules}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Törlés
              </Button>
            </div>
          </div>
        }
      />

      {evaluation.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-muted">
          {evaluation.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12.5px] text-muted-dim">
        A hivatalos jegyet az oktató adja; ez a számítás a beállított szabályokból és a rögzített eredményeidből készül.
      </p>
      {dialogs}
      {confirmDialog}
    </div>
  );
}

function seriesMeta(c: Extract<RuleComponent, { kind: "series" }>): string {
  const s = c.scoring;
  if (s.kind === "plusMinus") return `${c.count} alkalom, plusz vagy mínusz`;
  if (s.kind === "percent") {
    return `${c.count} db, min. ${s.passAt}%${s.attempts ? `, ${s.attempts} próbálkozás` : ""}${s.onTimeOnly ? ", csak határidőre" : ""}`;
  }
  const parts = s.parts?.length ? ` (${s.parts.map((p) => `${p.label.toLowerCase()} ${formatNumber(p.max)}`).join(" + ")})` : "";
  return `${c.count} × ${formatNumber(s.max)} pont${parts}`;
}

const RETAKE_PICK: Record<RetakeSlot["pick"], string> = {
  worse: "a rosszabbat váltja ki",
  failed: "a sikertelent váltja ki",
  choose: "a választottat váltja ki",
};

function retakeMeta(slot: RetakeSlot, scale: Scale, labelOf: (id: string) => string): string {
  const targets = slot.targets.map(labelOf).join(", ");
  return `${targets}: ${RETAKE_PICK[slot.pick]}${slot.mode === "ifBetter" ? ", ha jobb" : ""} · ${scaleHint(scale)}`;
}

/** A stamp for what a component's results add up to so far. */
function ComponentStatus({ e, labelOf }: { e: ComponentEval | undefined; labelOf: (id: string) => string }) {
  if (!e) return null;
  if (e.replacedBy) return <Badge color="var(--muted)">Kiváltva: {labelOf(e.replacedBy)}</Badge>;
  if (e.kind === "retake" && e.replaces) return <Badge color="var(--accent)">{labelOf(e.replaces)} helyett</Badge>;
  if (e.status === "na") return <Badge color="var(--muted)">Elmaradt</Badge>;
  if (e.status === "passed") return <Badge color="var(--success)">{e.kind === "assignment" ? "Elfogadva" : "Sikeres"}</Badge>;
  if (e.status === "failed") return <Badge color="var(--danger)">{e.kind === "assignment" ? "Nem fogadták el" : "Sikertelen"}</Badge>;
  if (e.overdueEntry) return <Badge color="var(--warning)">Eredményre vár</Badge>;
  return null;
}

// ----- standing -----

const gradeWord = (g: number | null) => (g === null || g === 0 ? "nincs jegy" : String(g));

const STATUS: Record<OutcomeEval["status"], { text: string; color: string }> = {
  final: { text: "Végleges", color: "var(--success)" },
  provisional: { text: "Várható", color: "var(--accent)" },
  open: { text: "Nyitott", color: "var(--muted)" },
};

const GATE_TEXT: Record<GateStatus, string> = {
  met: "teljesült",
  failed: "nem teljesült",
  fixable: "pótolható",
  open: "még nyitott",
};

/** Every grade on one sheet, side by side when there is room. */
function Standing({ outcomes }: { outcomes: OutcomeEval[] }) {
  if (outcomes.length === 0) return null;
  return (
    <section aria-label="Hol állsz" className="sheet-paper overflow-hidden">
      <div className={`grid ${outcomes.length > 1 ? "@2xl:grid-cols-2" : ""}`}>
        {outcomes.map((o) => (
          <OutcomeStanding key={o.outcomeId} outcome={o} wide={outcomes.length === 1} />
        ))}
      </div>
    </section>
  );
}

function OutcomeStanding({ outcome, wide }: { outcome: OutcomeEval; wide: boolean }) {
  const { status, current, best, worst } = outcome;
  const lo = Math.min(worst, best);
  const hi = Math.max(worst, best);
  const grades: GradeValue[] = [...(lo === 0 || current === 0 ? [0 as const] : []), 1, 2, 3, 4, 5];
  const unmet = outcome.gates.filter((g) => g.status !== "met");
  const gates = [...unmet, ...outcome.gates.filter((g) => g.status === "met")];

  const summary =
    status === "final"
      ? `Végleges: ${gradeWord(current)}.`
      : status === "provisional"
        ? lo === hi
          ? `A mostani eredményekkel ${gradeWord(current)}, és ez már nem változik.`
          : `A mostani eredményekkel ${gradeWord(current)}; legjobb esetben ${gradeWord(hi)}.`
        : lo === hi
          ? `Még nincs elég eredmény; ${gradeWord(hi)} várható.`
          : `Még nincs elég eredmény. Elérhető: ${gradeWord(lo)}–${hi}.`;

  return (
    <div
      className={`flex flex-col gap-3 border-t border-border px-5 py-4 first:border-t-0 sm:px-6 @2xl:border-t-0 @2xl:border-l @2xl:first:border-l-0 ${
        wide ? "@2xl:flex-row @2xl:items-start @2xl:gap-10" : ""
      }`}
    >
      <div className={`flex min-w-0 flex-col gap-2.5 ${wide ? "@2xl:w-[22rem] @2xl:shrink-0" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[16px] font-bold text-heading">{outcome.label}</h4>
          <Badge color={STATUS[status].color}>{STATUS[status].text}</Badge>
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
                <span className={`font-display tabular-nums leading-none ${g === 0 ? "text-[13px] font-semibold tracking-normal" : "text-[24px]"}`}>
                  {g === 0 ? "nincs" : g}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-[13px] leading-snug text-muted">{summary}</p>
      </div>
      {(gates.length > 0 || outcome.applied.length > 0) && (
        <div className="min-w-0 flex-1">
          {gates.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {gates.map((g) => (
                <li key={`${g.pathId ?? ""}-${g.id}`} className="flex items-start gap-2 text-[13.5px] leading-snug">
                  <GateIcon status={g.status} />
                  <span className={g.status === "failed" || g.status === "fixable" ? "text-danger" : g.status === "met" ? "text-muted" : "text-foreground"}>
                    {g.label}
                    <span className="sr-only">: {GATE_TEXT[g.status]}</span>
                    {g.status === "fixable" && <span className="text-[12.5px]"> · pótolható</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outcome.applied.length > 0 && (
            <p className="mt-1.5 text-[12.5px] text-muted">Beszámítva: {outcome.applied.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ----- "mi kell a jegyhez" -----

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

  // The answer as a figure ("12 pont", "4-es") inside its sentence.
  let figure: string | null = null;
  let before = "";
  let after = "";
  if (answer && targetInfo) {
    if (answer.status === "already") before = `A ${goal}-es ${outcomeLabel.toLowerCase()} már megvan, ettől függetlenül.`;
    else if (answer.status === "unreachable") before = answer.reason ?? `A ${goal}-es így már nem érhető el.`;
    else if (answer.min !== undefined) {
      const via = answer.viaRetake ? ` (${labelOf(answer.viaRetake)} megírásával)` : "";
      const series = targetInfo.kind === "series";
      before = `${labelOf(effectiveTarget)}: ${series ? "még legalább" : "legalább"}`;
      figure = series
        ? `${formatNumber(answer.min)} ${SERIES_UNIT[targetInfo.unit]}`
        : targetInfo.unit === "grade"
          ? `${answer.min}-es`
          : `${formatNumber(answer.min)} pont`;
      after = `kell${series ? " a hátralévőkből" : ""}${via}.`;
    }
  }
  const tone = answer?.status === "unreachable" ? "bg-salmon" : answer?.status === "already" ? "bg-sky" : "bg-inset";

  return (
    <section className="sheet-paper flex flex-col gap-3 px-5 py-4 sm:px-6" aria-labelledby="solver-title">
      <h3 id="solver-title" className="font-display text-[22px] text-heading">
        Mi kell a jegyhez?
      </h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <Label htmlFor="solve-outcome">Jegy</Label>
          <Select id="solve-outcome" value={effectiveOutcome} onChange={(e) => setOutcomeId(e.target.value)}>
            {rules.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="solve-goal">Cél</Label>
          <Select id="solve-goal" value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {[2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                legalább {g}
              </option>
            ))}
          </Select>
        </div>
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
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
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="A többi eredmény">
        <Pill active={others === "worst"} onClick={() => setOthers("worst")}>
          Biztosan
        </Pill>
        <Pill active={others === "best"} onClick={() => setOthers("best")}>
          Ha a többi is jól megy
        </Pill>
      </div>
      {before && (
        <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--radius-slip)] px-4 py-3 text-[14.5px] text-heading ${tone}`} aria-live="polite">
          <span>{before}</span>
          {figure && <span className="font-display text-[24px] leading-none tabular-nums">{figure}</span>}
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
      {note && <p className="text-[14px] text-muted">{note}</p>}
      <div>
        <Label htmlFor="rules-json">Szabályok</Label>
        <Textarea
          id="rules-json"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={18}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="font-mono !text-[12.5px] leading-relaxed max-sm:min-h-[45dvh]"
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
          {back && <ArrowLeft className="h-4 w-4" aria-hidden />}
          {back ? "Vissza" : "Mégse"}
        </Button>
        <Button type="submit">Mentés</Button>
      </DialogActions>
    </form>
  );
}

