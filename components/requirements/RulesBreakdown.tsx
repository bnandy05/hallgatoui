"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { ComponentEval, Evaluation, GateStatus, OutcomeEval } from "@/lib/rules/engine";
import { parseFormula, type Ast } from "@/lib/rules/expr";
import {
  formulaDescriber,
  GATE_FAIL_TEXT,
  postStepText,
  RETAKE_PICK_TEXT,
  ruleLabels,
  tableTitle,
} from "@/lib/rules/describe";
import type { GradeTable, Outcome, SubjectRules } from "@/lib/rules/types";
import { GateIcon } from "./GateIcon";

// "Így számoljuk": the rule set read back as structure, with the student's numbers in it. Every
// grade with its conditions (live status for the path that counts now), each threshold table as
// a ruler with the reachable grades marked, every intermediate value with its current range, and
// the retakes. Generated from the rules only, so it shows any valid JSON the same way.

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

const COMPARE = new Set(["<", ">", "<=", ">=", "==", "!=", "&&", "||"]);

/** A formula whose result is a yes/no (a comparison or a logical expression at the top). */
function isCondition(ast: Ast): boolean {
  return ast.k === "not" || (ast.k === "bin" && COMPARE.has(ast.op));
}

/** Every `table(id, x)` lookup in a formula, with its argument. */
function tableLookups(ast: Ast, out: { table: string; e: Ast }[] = []): { table: string; e: Ast }[] {
  switch (ast.k) {
    case "table":
      out.push({ table: ast.table, e: ast.e });
      tableLookups(ast.e, out);
      break;
    case "neg":
    case "not":
      tableLookups(ast.e, out);
      break;
    case "bin":
      tableLookups(ast.l, out);
      tableLookups(ast.r, out);
      break;
    case "fn":
      for (const a of ast.args) tableLookups(a, out);
      break;
  }
  return out;
}

type Range = { worst: number; best: number };

function lookup(table: GradeTable, x: number): number | null {
  let value: number | null = null;
  for (const row of table.rows) if (row.min <= x + 1e-9) value = row.value;
  return value;
}

export function RulesBreakdown({
  rules,
  evaluation,
  footer,
}: {
  rules: SubjectRules;
  evaluation: Evaluation;
  /** Where the rules came from and what can be done with them. */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 64rem)").matches);
  const f = formulaDescriber(rules);
  const labels = ruleLabels(rules);
  const components = new Map(evaluation.components.map((c) => [c.id, c]));

  /** The current range of a value a formula refers to, when the engine knows it. */
  function rangeOf(e: Ast): Range | null {
    if (e.k !== "ref" || e.part) return null;
    const d = evaluation.derived[e.id];
    if (d) return { worst: Math.min(d.worst, d.best), best: Math.max(d.worst, d.best) };
    const c: ComponentEval | undefined = components.get(e.id);
    const v = c?.effective ?? c?.points;
    return v === undefined ? null : { worst: v, best: v };
  }

  // The first lookup of each table tells what it is applied to.
  const tableInputs = new Map<string, Ast>();
  for (const src of [...rules.derived.map((d) => d.expr), ...rules.outcomes.flatMap((o) => o.paths.map((p) => p.grade))]) {
    const parsed = parseFormula(src);
    if (!parsed.ok) continue;
    for (const l of tableLookups(parsed.ast)) if (!tableInputs.has(l.table)) tableInputs.set(l.table, l.e);
  }

  const hasCalc = rules.tables.length > 0 || rules.derived.length > 0 || rules.retakes.length > 0;
  const panelId = "rules-breakdown";

  return (
    <section className="sheet-paper px-5 py-4 sm:px-6" aria-labelledby={`${panelId}-title`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-[var(--radius)] px-2 py-1 text-left hover:bg-wash/[0.03]"
      >
        <span className="min-w-0">
          <span id={`${panelId}-title`} className="block font-display text-[22px] text-heading">
            Így számoljuk
          </span>
          <span className="mt-0.5 block text-[13px] text-muted">
            {rules.outcomes.length === 1 ? "A jegy feltételei" : "A jegyek feltételei"}, a táblázatok és a részeredmények, a te
            számaiddal.
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <div id={panelId} hidden={!open} className="mt-3">
        <div className={`grid gap-x-10 gap-y-6 ${hasCalc ? "@3xl:grid-cols-2" : ""}`}>
          <div className="flex min-w-0 flex-col gap-6">
            {rules.outcomes.map((o) => (
              <OutcomeRules
                key={o.id}
                outcome={o}
                live={evaluation.outcomes.find((e) => e.outcomeId === o.id)}
                f={f}
              />
            ))}
          </div>
          {hasCalc && (
            <div className="flex min-w-0 flex-col gap-6">
              {rules.tables.map((t) => {
                const input = tableInputs.get(t.id);
                return (
                  <TableRuler
                    key={t.id}
                    title={tableTitle(rules, t.id)}
                    table={t}
                    inputLabel={input?.k === "ref" ? labels[input.part ? `${input.id}.${input.part}` : input.id] ?? input.id : undefined}
                    range={input ? rangeOf(input) : null}
                  />
                );
              })}
              {rules.derived.length > 0 && (
                <Block title="Részeredmények">
                  <ul className="flex flex-col">
                    {rules.derived.map((d) => {
                      const parsed = parseFormula(d.expr);
                      const condition = parsed.ok && isCondition(parsed.ast);
                      const r = evaluation.derived[d.id];
                      return (
                        <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-border py-2 first:border-t-0 first:pt-0">
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold leading-snug text-heading">{d.label}</span>
                            <span className="block text-[12.5px] leading-snug text-muted">{f(d.expr)}</span>
                          </span>
                          {r && <DerivedValue range={r} condition={condition} />}
                        </li>
                      );
                    })}
                  </ul>
                </Block>
              )}
              {rules.retakes.length > 0 && (
                <Block title="Javítás">
                  <ul className="flex flex-col">
                    {rules.retakes.map((r) => (
                      <li key={r.id} className="border-t border-border py-2 first:border-t-0 first:pt-0">
                        <span className="block text-[13.5px] font-semibold leading-snug text-heading">{r.label}</span>
                        <span className="block text-[12.5px] leading-snug text-muted">
                          {r.targets.map((t) => labels[t] ?? t).join(", ")}: {RETAKE_PICK_TEXT[r.pick]},{" "}
                          {r.mode === "replace" ? "akkor is, ha rosszabb" : "csak ha jobb"}
                          {r.eligible && r.eligible !== "1" ? `. Csak ha ${f(r.eligible)}.` : "."}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </div>
          )}
        </div>
      </div>
      {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
    </section>
  );
}

function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="text-[15px] font-bold text-heading">{title}</h4>
        {aside}
      </div>
      {children}
    </div>
  );
}

function DerivedValue({ range, condition }: { range: { best: number; worst: number }; condition: boolean }) {
  const lo = Math.min(range.best, range.worst);
  const hi = Math.max(range.best, range.worst);
  if (condition) {
    const text = lo >= 1 ? "teljesül" : hi < 1 ? "nem teljesül" : "még nyitott";
    const tone = lo >= 1 ? "text-success" : hi < 1 ? "text-danger" : "text-muted-dim";
    return <span className={`text-[12.5px] font-semibold ${tone}`}>{text}</span>;
  }
  return (
    <span className="text-right text-[14px] font-semibold tabular-nums text-heading">
      {lo === hi ? num(lo) : `${num(lo)}–${num(hi)}`}
    </span>
  );
}

const GATE_TEXT: Record<GateStatus, string> = {
  met: "teljesült",
  failed: "nem teljesült",
  fixable: "pótolható",
  open: "még nyitott",
};

function GateLine({ label, onFail, status }: { label: string; onFail: "none" | "fail"; status?: GateStatus }) {
  return (
    <li className="flex items-start gap-2 py-0.5 text-[13.5px] leading-snug">
      {status ? <GateIcon status={status} /> : <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-dim" aria-hidden />}
      <span className="min-w-0">
        <span className={status === "failed" || status === "fixable" ? "text-danger" : "text-foreground"}>{label}</span>
        <span className="text-muted">
          {status && <span className="sr-only">: {GATE_TEXT[status]}</span>} · különben {GATE_FAIL_TEXT[onFail]}
        </span>
      </span>
    </li>
  );
}

function OutcomeRules({ outcome, live, f }: { outcome: Outcome; live?: OutcomeEval; f: (src: string) => string }) {
  const status = (gateId: string, pathId?: string) => live?.gates.find((g) => g.id === gateId && g.pathId === pathId)?.status;
  const many = outcome.paths.length > 1;
  return (
    <Block
      title={outcome.label}
      aside={many && <span className="text-[12.5px] text-muted">{outcome.select === "best" ? "A legjobb érvényes út számít" : "Az első érvényes út számít"}</span>}
    >
      {(outcome.gates?.length ?? 0) > 0 && (
        <ul className="mb-2 flex flex-col">
          {outcome.gates!.map((g) => (
            <GateLine key={g.id} label={g.label} onFail={g.onFail} status={status(g.id)} />
          ))}
        </ul>
      )}
      <ol className="flex flex-col gap-2">
        {outcome.paths.map((p, i) => {
          const current = !!live && live.path === p.id;
          return (
            <li
              key={p.id}
              className={`rounded-[var(--radius-slip)] px-3 py-2.5 ${current && many ? "bg-inset ring-1 ring-border-strong" : "bg-inset"}`}
            >
              {many && (
                <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] font-semibold text-heading">
                  <span>
                    {i + 1}. {p.label}
                  </span>
                  {current && <span className="text-[12px] font-medium text-muted">ez számít most</span>}
                </p>
              )}
              {p.when && p.when !== "1" && <p className="text-[12.5px] leading-snug text-muted">Ha {f(p.when)}.</p>}
              {(p.gates?.length ?? 0) > 0 && (
                <ul className="mt-1 flex flex-col">
                  {p.gates!.map((g) => (
                    <GateLine key={g.id} label={g.label} onFail={g.onFail} status={current ? status(g.id, p.id) : undefined} />
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[13.5px] leading-snug text-foreground">
                <span className="font-semibold text-heading">Jegy: </span>
                {f(p.grade)}
                {p.post?.length ? <span className="text-muted">; {p.post.map((s) => postStepText(s, f)).join("; ")}</span> : null}
              </p>
            </li>
          );
        })}
      </ol>
    </Block>
  );
}

/** A threshold table as a ruler: one cell per row, the grades the student can still reach marked. */
function TableRuler({
  title,
  table,
  inputLabel,
  range,
}: {
  title: string;
  table: GradeTable;
  inputLabel?: string;
  range: Range | null;
}) {
  const lo = range ? lookup(table, range.worst) : null;
  const hi = range ? lookup(table, range.best) : null;
  const rows = [...table.rows].sort((a, b) => a.min - b.min);
  return (
    <Block
      title={title}
      aside={
        inputLabel && (
          <span className="text-[12.5px] text-muted">
            {inputLabel}
            {range && (
              <>
                : <span className="font-semibold tabular-nums text-heading">
                  {range.worst === range.best ? num(range.worst) : `${num(range.worst)}–${num(range.best)}`}
                </span>
              </>
            )}
          </span>
        )
      }
    >
      <ol className="grid grid-flow-col auto-cols-fr gap-1" aria-label={title}>
        {rows.map((row, i) => {
          const next = rows[i + 1];
          const reach = lo !== null && hi !== null && row.value >= Math.min(lo, hi) && row.value <= Math.max(lo, hi);
          // A row is the current one when the whole range falls inside it.
          const exact = reach && lo === hi && range !== null && range.worst >= row.min && (!next || range.best < next.min);
          return (
            <li
              key={`${row.min}-${row.value}`}
              className={`flex min-w-0 flex-col items-center rounded-[var(--radius-slip)] border px-1 pb-1.5 pt-1 ${
                exact ? "border-accent bg-accent text-accent-ink" : reach ? "border-border-strong bg-card text-heading" : "border-transparent bg-inset text-muted"
              }`}
            >
              <span className="font-display text-[22px] leading-none tabular-nums">{row.value}</span>
              <span className={`mt-1 text-[12px] tabular-nums ${exact ? "" : "text-muted"}`}>≥ {num(row.min)}</span>
            </li>
          );
        })}
      </ol>
    </Block>
  );
}
