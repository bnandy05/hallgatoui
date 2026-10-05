// Turns the lexicon's draft into a SubjectRules document. Whatever the text leaves open becomes a
// Question (Jev answers it first; below its confidence threshold the student does); conventional
// defaults become "Ellenőrizd" flags; anything that cannot be built is an error, and an error
// rejects the whole result (the student gets the manual setup instead). Pure.

import type {
  AssignmentOutcome,
  Derived,
  Gate,
  GradePath,
  GradeTable,
  Outcome,
  PostStep,
  RetakeSlot,
  RuleComponent,
  RuleFlag,
  SubjectRules,
} from "../types";
import {
  capital,
  groupIds,
  groupLabels,
  mainExams,
  mustPassGate,
  type Draft,
  type GateDraft,
  type Group,
  type NounKey,
  type OnFail,
} from "./lexicon";

export interface QuestionOption {
  id: string;
  label: string; // Hungarian, shown to the student
  criterion: string; // English, sent to Jev
}

export interface Question {
  id: string;
  prompt: string; // Hungarian
  instructions: string; // English, sent to Jev
  quote: string; // the sentence(s) the question is about; Jev's state
  options: QuestionOption[];
}

/** question id → chosen option id */
export type Answers = Record<string, string>;

export interface Assembled {
  rules: SubjectRules;
  questions: Question[];
  errors: string[];
  sources: { label: string; quote: string }[];
  totalId?: string; // the derived value the stated total ("Összesen N pont") refers to
}

const ON_FAIL_OPTIONS: QuestionOption[] = [
  { id: "fail", label: "Elégtelen (1)", criterion: "the student gets a failing grade (1, elégtelen)" },
  { id: "none", label: "Nincs jegy (letiltás, aláírás megtagadva)", criterion: "the student gets no grade at all (signature refused, not graded)" },
];

const YES_NO: QuestionOption[] = [
  { id: "yes", label: "Igen", criterion: "yes" },
  { id: "no", label: "Nem", criterion: "no" },
];

class Builder {
  questions: Question[] = [];
  errors: string[] = [];
  flags: RuleFlag[] = [];
  sources: { label: string; quote: string }[] = [];
  answers: Answers;
  constructor(answers: Answers) {
    this.answers = answers;
  }

  ask<T>(q: Question, apply: Record<string, T>): T {
    if (!this.questions.some((x) => x.id === q.id)) this.questions.push(q);
    const picked = this.answers[q.id];
    // Unanswered: the first option keeps the preview buildable; saving stays blocked until answered.
    return apply[picked] ?? apply[q.options[0].id];
  }

  flag(field: string, message: string): void {
    this.flags.push({ field, message, resolved: false });
  }

  source(label: string, quote: string | undefined): void {
    if (quote && !this.sources.some((s) => s.label === label)) this.sources.push({ label, quote });
  }
}

function onFailOf(b: Builder, gate: { id: string; label: string; onFail?: OnFail; quote: string }): OnFail {
  if (gate.onFail) return gate.onFail;
  return b.ask(
    {
      id: `onfail:${gate.id}`,
      prompt: `Ha nem teljesül: „${gate.label}”, mi a következménye?`,
      instructions: `This sentence is from a Hungarian university course's grading rules. It states a requirement: "${gate.label}". If the student does not meet it, what happens?`,
      quote: gate.quote,
      options: ON_FAIL_OPTIONS,
    },
    { fail: "fail", none: "none" }
  );
}

export function assemble(d: Draft, answers: Answers): Assembled {
  const b = new Builder(answers);
  const groups = d.order.map((k) => d.groups.get(k)!);
  const components: RuleComponent[] = [];
  const retakes: RetakeSlot[] = [];
  const derived: Derived[] = [];
  const tables: GradeTable[] = [];
  const outcomes: Outcome[] = [];

  // ----- components -----

  if (d.attendance && (d.attendance.maxAbsences !== undefined || d.attendance.unexcusedMinus)) {
    const a = d.attendance;
    const comp: RuleComponent = { id: "jelen", label: "Jelenlét", kind: "attendance" };
    if (a.maxAbsences !== undefined) {
      const countExcused =
        a.countExcused ??
        b.ask(
          {
            id: "excused",
            prompt: "Az igazolt hiányzás is beleszámít a megengedett hiányzások számába?",
            instructions:
              "This sentence is from a Hungarian university course's attendance rules. Do excused absences (igazolt hiányzás) also count towards the absence limit?",
            quote: a.quote,
            options: [
              { id: "yes", label: "Igen, minden hiányzás számít", criterion: "every absence counts, excused or not" },
              { id: "no", label: "Nem, csak az igazolatlan", criterion: "only unexcused absences count" },
            ],
          },
          { yes: true, no: false }
        );
      const onExceed =
        a.onExceed ??
        onFailOf(b, { id: "hianyzas", label: `legfeljebb ${a.maxAbsences} hiányzás`, quote: a.quote });
      comp.limit = { maxAbsences: a.maxAbsences, countExcused, onExceed };
    }
    components.push(comp);
    b.source("Jelenlét", a.quote);
  }

  for (const g of groups) {
    if (g.count === undefined && g.kind !== "series") {
      g.count = 1;
      b.flag(`components.${g.idBase}`, `A(z) ${g.label} darabszáma nincs megadva; 1 feltételezve.`);
    }
    const ids = groupIds(g);
    const labels = groupLabels(g);
    b.source(capital(g.label), g.quote);
    if (g.kind === "assignment") {
      const outs: AssignmentOutcome[] = [];
      if (g.onTime === undefined) b.errors.push(`A(z) ${g.label} pontszáma nincs megadva.`);
      outs.push({ id: "ok", label: "Határidőre elfogadva", points: g.onTime ?? 0, accepted: true });
      if (g.late !== undefined) outs.push({ id: "javitott", label: "Javítás után elfogadva", points: g.late, accepted: true });
      outs.push({ id: "elutasitva", label: "Nem fogadták el", points: 0, accepted: false });
      ids.forEach((id, i) => components.push({ id, label: labels[i], kind: "assignment", outcomes: outs }));
    } else if (g.kind === "exam") {
      if (g.key === "gyakuv" && g.parts && g.max) for (const p of g.parts) p.max ||= g.max / g.parts.length;
      if (!g.grade && g.max === undefined) {
        b.errors.push(`A(z) ${g.label} pontszáma (vagy jeggyel értékelése) nincs megadva.`);
        continue;
      }
      if (g.partsAssumed) b.flag(`components.${ids[0]}.scale.parts`, g.partsAssumed);
      for (const [i, id] of ids.entries()) {
        const scale = g.grade
          ? { kind: "grade" as const, ...(g.passAt !== undefined && g.passAt !== 2 ? { passAt: g.passAt } : {}) }
          : {
              kind: "points" as const,
              max: g.max!,
              ...(g.passAt !== undefined ? { passAt: g.passAt } : {}),
              ...(g.parts ? { parts: g.parts.map((p) => ({ ...p })) } : {}),
            };
        components.push({ id, label: g.key === "zh" && ids.length > 1 ? `${i + 1}. zh` : labels[i], kind: "exam", scale });
      }
    } else {
      let count = g.count;
      if (count === undefined) {
        count = 12;
        b.flag(`components.${g.idBase}.count`, `A(z) ${g.label} darabszáma nincs megadva; 12 feltételezve (órarendből pontosítható).`);
      }
      const id = ids[0];
      if (g.key === "kviz") {
        const passAt = g.percent?.passAt;
        if (passAt === undefined) b.errors.push("A kvízek teljesítési határa (%) nincs megadva.");
        components.push({
          id,
          label: "Kvíz",
          kind: "series",
          item: "quiz",
          count,
          scoring: {
            kind: "percent",
            passAt: passAt ?? 0,
            ...(g.percent?.attempts !== undefined ? { attempts: g.percent.attempts } : {}),
            onTimeOnly: g.percent?.onTimeOnly ?? false,
          },
        });
      } else if (g.plusMinus) {
        components.push({ id, label: `${capital(g.label)} (+/−)`, kind: "series", item: "ropzh", count, scoring: { kind: "plusMinus" } });
      } else {
        if (g.max === undefined) {
          b.errors.push(`A(z) ${g.label} pontszáma nincs megadva.`);
          continue;
        }
        components.push({
          id,
          label: capital(g.label),
          kind: "series",
          item: "ropzh",
          count,
          scoring: { kind: "points", max: g.max, ...(g.parts ? { parts: g.parts.map((p) => ({ ...p })) } : {}) },
        });
      }
    }
  }

  if (d.bonus) {
    components.push({ id: "bonusz", label: "Bónuszpont", kind: "bonus", ...(d.bonus.cap !== undefined ? { cap: d.bonus.cap } : {}) });
    b.source("Bónuszpont", d.bonus.quote);
  }

  const has = (id: string) => components.some((c) => c.id === id);
  const series = (pred: (g: Group) => boolean) => groups.find((g) => g.kind === "series" && pred(g));

  // ----- retakes -----

  for (const r of d.retakes) {
    const targets = r.groups.flatMap((k) => (d.groups.has(k) ? groupIds(d.groups.get(k)!) : [])).filter(has);
    if (targets.length === 0) continue;
    const pick =
      r.pick ??
      (targets.length === 1
        ? "choose"
        : b.ask(
            {
              id: `pick:${r.id}`,
              prompt: `${r.label}: melyik zh eredményét váltja ki?`,
              instructions:
                "This sentence is from a Hungarian university course's rules about a retake exam (pótzh / javító zh). Which earlier exam result does the retake replace?",
              quote: r.quote,
              options: [
                { id: "worse", label: "A rosszabbat", criterion: "the worse of the earlier results" },
                { id: "failed", label: "A sikertelent", criterion: "the one the student failed" },
                { id: "choose", label: "Amelyiket a hallgató választja", criterion: "whichever one the student chooses" },
              ],
            },
            { worse: "worse", failed: "failed", choose: "choose" } as const
          ));
    const mode =
      r.mode ??
      b.ask(
        {
          id: `mode:${r.id}`,
          prompt: `${r.label}: ha rosszabb lesz, mint az eredeti, akkor is az számít?`,
          instructions:
            "This sentence is from a Hungarian university course's rules about a retake exam (pótzh / javító zh). If the retake result is worse than the original, which result counts?",
          quote: r.quote,
          options: [
            { id: "replace", label: "Igen, mindig a pótzh számít", criterion: "the retake always replaces the original, even if it is worse" },
            { id: "ifBetter", label: "Nem, csak ha jobb", criterion: "the retake only counts if it is better than the original" },
          ],
        },
        { replace: "replace", ifBetter: "ifBetter" } as const
      );
    const slot: RetakeSlot = { id: r.id, label: r.label, targets, pick, mode };
    if (r.eligibleOneFailed) slot.eligible = `countRaw(failed, ${targets.join(", ")}) == 1`;
    retakes.push(slot);
    b.source(r.label, r.quote);
  }

  // ----- tables -----

  for (const g of groups) {
    if (!g.conversion) continue;
    tables.push({ id: `${g.idBase}tabla`, rows: g.conversion });
  }
  const gradeTable = d.tables.at(-1);
  let mainTable: GradeTable | undefined;
  if (gradeTable) {
    const rows = [...gradeTable.rows].sort((x, y) => x.value - y.value);
    const out: { min: number; value: number }[] = [];
    rows.forEach((row, i) => {
      const lo = row.lo ?? (i === 0 ? 0 : (rows[i - 1].hi ?? NaN) + 1);
      if (!Number.isFinite(lo)) b.errors.push("A jegytáblázat egyik sorának alsó határa nem olvasható ki.");
      out.push({ min: lo, value: row.value });
      const prevHi = rows[i - 1]?.hi;
      if (i > 0 && prevHi !== undefined && row.lo !== undefined && row.lo !== prevHi + 1 && row.lo !== prevHi) {
        b.errors.push(`A jegytáblázat sávjai nem illeszkednek: ${prevHi} után ${row.lo} következik.`);
      }
    });
    if (out.length > 0 && out[0].min > 0) {
      out.unshift({ min: 0, value: 1 });
      b.flag("tables.jegy", `${out[1].min} pont alatt elégtelen (1) feltételezve.`);
    }
    mainTable = { id: "jegy", rows: out };
    tables.push(mainTable);
    b.source("Jegytáblázat", gradeTable.quote);
  }

  // ----- derived values -----

  const exams = mainExams(d).filter((g) => groupIds(g).every(has));
  for (const g of exams) {
    if (!g.conversion) continue;
    for (const id of groupIds(g)) derived.push({ id: `${id}jegy`, label: `${capital(g.label)} jegye`, expr: `table(${g.idBase}tabla, ${id})` });
  }

  const pmSeries = series((g) => !!g.plusMinus);
  if (d.pmGate || d.attendance?.unexcusedMinus) {
    if (!pmSeries) {
      if (d.pmGate) b.errors.push("Plusz/mínusz feltétel van, de nem találtunk +/− értékelésű röpzh-t.");
    } else {
      const unexcused = d.attendance?.unexcusedMinus && has("jelen") ? " + count(unexcused, jelen)" : "";
      derived.push({ id: "minusz", label: unexcused ? "Mínuszok (igazolatlan hiányzással)" : "Mínuszok", expr: `count(minus, ${pmSeries.idBase})${unexcused}` });
      derived.push({ id: "plusz", label: "Pluszok", expr: `count(plus, ${pmSeries.idBase})` });
    }
  }
  if (d.quizMin) {
    if (has("kviz")) derived.push({ id: "kvizok", label: `Kvíz feltétel (${d.quizMin.min}/${d.groups.get("kviz")?.count ?? "?"})`, expr: `count(passed, kviz) >= ${d.quizMin.min}` });
    else b.errors.push("Kvízfeltétel van, de a kvízek nincsenek leírva.");
    b.source("Kvízek", d.quizMin.quote);
  }
  const pointSeries = series((g) => !g.plusMinus && g.key !== "kviz");
  if (d.seriesPass && pointSeries) {
    derived.push({ id: `${pointSeries.idBase}ok`, label: `${capital(pointSeries.label)} teljesítve (≥ ${d.seriesPass.min})`, expr: `${pointSeries.idBase} >= ${d.seriesPass.min}` });
    b.source(`${capital(pointSeries.label)} teljesítése`, d.seriesPass.quote);
  }
  let bonusTerm: string | undefined = d.bonus ? "bonusz" : undefined;
  if (d.surplusBonus && pointSeries) {
    const id = has("bonusz") ? "rbonusz" : "bonusz";
    derived.push({ id, label: `${capital(pointSeries.label)} bónusz (${d.surplusBonus.over} fölött)`, expr: `max(0, ${pointSeries.idBase} - ${d.surplusBonus.over})` });
    bonusTerm ??= id;
    b.source("Bónusz", d.surplusBonus.quote);
  }

  // Gates of the main path, resolved now (atmegy below needs their tests).
  const allGates: GateDraft[] = [...d.gates];
  const covered = (g: Group) => allGates.some((x) => x.id === "zhk" && x.test().includes(groupIds(g)[0]));
  for (const g of exams) if (g.passAtExplicit && !covered(g)) mustPassGate(d, g);
  for (const x of d.gates) if (!allGates.includes(x)) allGates.push(x);
  const pathGates: Gate[] = [];
  const outcomeGates: Gate[] = [];
  for (const g of allGates) {
    const gate: Gate = { id: g.id, label: g.label, test: g.test(), onFail: onFailOf(b, g) };
    (g.scope === "path" ? pathGates : outcomeGates).push(gate);
    b.source(g.label, g.quote);
  }
  if (d.pmGate && derived.some((x) => x.id === "minusz")) {
    outcomeGates.push({ id: "pm", label: "Mínuszok ≤ pluszok", test: "minusz <= plusz", onFail: onFailOf(b, { id: "pm", label: "a mínuszok száma nem haladhatja meg a pluszokét", onFail: d.pmGate.onFail, quote: d.pmGate.quote }) });
    b.source("Plusz/mínusz", d.pmGate.quote);
  }

  if (d.bonus?.onlyIfPass) {
    const tests = pathGates.map((g) => g.test).filter((t) => !/\bbonusz/.test(t));
    if (tests.length === 0) {
      b.flag("derived.bonuszbe", "A bónusz csak sikeres teljesítésnél számít, de a feltételeket nem találtuk; mindig beszámítjuk.");
    } else {
      derived.push({ id: "atmegy", label: "Bónusz nélkül is átmegy", expr: tests.map((t) => (tests.length > 1 ? `(${t})` : t)).join(" && ") });
      derived.push({ id: "bonuszbe", label: "Beszámított bónusz", expr: "if(atmegy, bonusz, 0)" });
      bonusTerm = "bonuszbe";
    }
  }

  // Formula identifiers: letters, "z1"/"zh2"/"n3", "bonusz", group names, earlier derived values.
  const resolve = (expr: string, where: string): string =>
    expr.replace(/@([a-z]+)|\b([a-z_][a-z0-9_]*)\b/g, (whole, groupKey: string | undefined, word: string | undefined) => {
      if (groupKey) {
        const g = d.groups.get(groupKey as NounKey);
        return g ? groupIds(g).join(" + ") : (b.errors.push(`${where}: ismeretlen tag`), "0");
      }
      const w = word!;
      if (["floor", "min", "max", "if", "count", "countRaw", "table", "grade", "taken", "raw"].includes(w)) return w;
      if (/^bonusz/.test(w) && bonusTerm) return bonusTerm;
      if (derived.some((x) => x.id === w) || has(w)) return w;
      if (d.letters.has(w)) return w;
      const m = /^(z|zh|n|nzh|nagyzh|gy|gyzh)(\d+)$/.exec(w);
      if (m) {
        const g =
          m[1].startsWith("n") ? d.groups.get("nagyzh") : m[1].startsWith("gy") ? d.groups.get("gyzh") : (d.groups.get("zh") ?? exams[0]);
        const id = g ? groupIds(g)[Number(m[2]) - 1] : undefined;
        if (id) return id;
      }
      b.errors.push(`${where}: nem tudjuk, mit jelent „${w}”.`);
      return "0";
    });

  for (const [letter, key] of d.letters) {
    const g = d.groups.get(key);
    if (!g) continue;
    derived.push({ id: letter, label: `${letter.toUpperCase()} (${g.label} összesen)`, expr: groupIds(g).join(" + ") });
  }
  for (const fm of d.formulas) {
    derived.push({ id: fm.id, label: fm.label, expr: resolve(fm.expr, fm.label) });
    b.source(fm.label, fm.quote);
  }

  // The total the grade table reads: the formula just before it, else "ossz", else the weighted sum.
  let totalId = gradeTable?.after ?? (derived.some((x) => x.id === "ossz") ? "ossz" : undefined);
  if (mainTable && !totalId && !d.gradeFormula) {
    const terms: string[] = [];
    for (const g of groups) {
      if (g.kind === "assignment") terms.push(...groupIds(g));
      else if (g.kind === "exam" && exams.includes(g)) {
        for (const id of groupIds(g)) {
          const t = g.conversion ? `${id}jegy` : id;
          terms.push(g.weight !== 1 ? `${g.weight}*${t}` : t);
        }
      } else if (g === pointSeries) terms.push(g.idBase);
    }
    if (bonusTerm) terms.push(bonusTerm);
    if (terms.length === 0) b.errors.push("Nem tudjuk, miből számol a jegytáblázat.");
    else {
      derived.push({ id: "ossz", label: d.totalStated ? `Összpontszám (max ${d.totalStated.value})` : "Összpontszám", expr: terms.join(" + ") });
      if (!d.totalStated) b.flag("derived.ossz", "Az összpontszám képlete nincs megadva; az összetevők összege feltételezve.");
      totalId = "ossz";
    }
  }
  if (d.totalStated) b.source("Összpontszám", d.totalStated.quote);

  // ----- outcomes -----

  const mainPost: PostStep[] = [];
  const eloPost: PostStep[] = [];
  const elo = d.groups.get("elo");
  if (elo?.cap !== undefined) eloPost.push({ kind: "cap", max: elo.cap });
  for (const m of d.modifiers) {
    const step: PostStep = { kind: "add", when: resolve(m.when(), m.label), delta: m.delta, label: m.label };
    if (m.target !== "main" && elo) eloPost.push(step);
    else mainPost.push(step);
    b.source(m.label, m.quote);
  }

  const mainGrade = d.gradeFormula
    ? resolve(d.gradeFormula.expr, "A jegy képlete")
    : mainTable && totalId
      ? `table(jegy, ${totalId})`
      : undefined;
  if (d.gradeFormula) b.source("A jegy képlete", d.gradeFormula.quote);

  if (mainGrade || d.uv) {
    const paths: GradePath[] = [];
    if (d.uv) {
      const g = d.groups.get(d.uv.group);
      const uv = d.groups.get("gyakuv");
      if (g && uv && has("gyakuv")) {
        const ids = groupIds(g).join(", ");
        const retake = retakes.find((r) => r.targets.some((t) => groupIds(g).includes(t)));
        let when = `countRaw(failed, ${ids}) >= 2`;
        if (retake) {
          const afterRetake = b.ask(
            {
              id: "uv:retake",
              prompt: `Ha a ${retake.label.toLowerCase()} sem sikerül, jár a gyakorlati utóvizsga?`,
              instructions:
                "These sentences are from a Hungarian university course's rules. If a student fails one exam, takes the retake (javító) and fails that too, may they take the practical re-exam (gyakorlati utóvizsga)?",
              quote: `${retake ? (d.retakes.find((r) => r.id === retake.id)?.quote ?? "") : ""} ${d.uv.quote}`.trim(),
              options: YES_NO.map((o) => ({ ...o, criterion: o.id === "yes" ? "yes, the re-exam is open after a failed retake too" : "no, only when two or more exams failed" })),
            },
            { yes: true, no: false }
          );
          if (afterRetake) when += ` || (taken(${retake.id}) && count(failed, ${ids}) >= 1)`;
        }
        const cap = uv.cap ?? 2;
        paths.push({
          id: "uv",
          label: `Gyakorlati utóvizsga (max ${cap})`,
          when,
          gates: [{ id: "uv", label: "Gyakorlati utóvizsga sikeres", test: "count(passed, gyakuv) == 1", onFail: "fail" }],
          grade: String(cap),
        });
        b.source("Gyakorlati utóvizsga", d.uv.quote);
      }
    }
    if (mainGrade) {
      const path: GradePath = { id: "alap", label: d.gradeFormula ? "Képlet szerint" : "Pontszám alapján", grade: mainGrade };
      if (pathGates.length) path.gates = pathGates;
      if (mainPost.length) path.post = mainPost;
      paths.push(path);
    }
    const o: Outcome = { id: "gyak", label: "Gyakorlati jegy", kind: "gyakorlat", select: "first", paths };
    if (outcomeGates.length) o.gates = outcomeGates;
    outcomes.push(o);
  } else {
    b.errors.push("Nem találtuk, hogyan jön ki a gyakorlati jegy (jegytáblázat vagy képlet).");
  }

  if (d.exam) {
    const paths: GradePath[] = [];
    if (elo && has("elo")) paths.push({ id: "elo", label: "Elővizsga", grade: "elo", ...(eloPost.length ? { post: eloPost } : {}) });
    if (has("szobeli")) paths.push({ id: "szobeli", label: "Szóbeli", grade: "szobeli" });
    if (paths.length) outcomes.push({ id: "vizsga", label: "Vizsgajegy", kind: "vizsga", select: d.exam.select, paths });
    b.source("Vizsga", d.exam.quote);
  }

  if (d.megaj && outcomes.some((o) => o.id === "gyak")) {
    const gates: Gate[] = [
      { id: "gyakjegy", label: "Van legalább 2-es gyakorlati jegy", test: "grade(gyak) >= 2", onFail: "none" },
      ...d.megaj.conditions.map((c, i) => ({ id: `m${i + 1}`, label: c.label, test: c.test(), onFail: "none" as const })),
    ];
    outcomes.push({
      id: "megaj",
      label: "Megajánlott vizsgajegy",
      kind: "megajanlott",
      select: "first",
      gates,
      paths: [{ id: "alap", label: "Gyakorlati jegy szerint", grade: "grade(gyak)" }],
    });
    b.flag("outcomes.megaj.gates.gyakjegy", "A megajánlott jegyhez legalább 2-es gyakorlati jegy kell (feltételezés).");
    b.flag("outcomes.megaj.paths.alap.grade", "A megajánlott jegy értéke nincs megadva; a gyakorlati jegy feltételezve.");
    b.source("Megajánlott vizsgajegy", d.megaj.quote);
  }

  const rules: SubjectRules = { schemaVersion: 1, components, retakes, derived, tables, outcomes, flags: b.flags };
  return { rules, questions: b.questions, errors: b.errors, sources: b.sources, totalId };
}
