// Strict shape validation of an untrusted rules document (it runs on the server on every save).
// Returns a cleaned copy (unknown keys dropped) or the list of problems. Every formula must parse
// and every reference must resolve; a polarity check reports formulas that may not be monotone
// as warnings (the engine's best/worst bounds are exact only for monotone rules).

import {
  checkFormula,
  parseFormula,
  type Ast,
  type FormulaScope,
  type Pred,
} from "./expr";
import type {
  AssignmentOutcome,
  Derived,
  Gate,
  GradePath,
  GradeTable,
  Outcome,
  Part,
  PostStep,
  RetakeSlot,
  RuleComponent,
  RuleFlag,
  Scale,
  SeriesScoring,
  SubjectRules,
} from "./types";

export const RULE_LIMITS = {
  components: 40,
  seriesCount: 60,
  retakes: 10,
  retakeTargets: 10,
  derived: 20,
  tables: 10,
  tableRows: 20,
  outcomes: 5,
  paths: 5,
  gates: 10,
  postSteps: 10,
  parts: 10,
  assignmentOutcomes: 10,
  flags: 30,
  label: 120,
  note: 1000,
  flagField: 200,
  flagMessage: 500,
  maxPoints: 10000,
} as const;

export const RULE_ID_RE = /^[a-z][a-z0-9_]*$/;

export type ValidateResult =
  | { ok: true; rules: SubjectRules; warnings: string[] }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class Ctx {
  errors: string[] = [];
  warnings: string[] = [];
  err(path: string, msg: string): void {
    if (this.errors.length < 100) this.errors.push(`${path}: ${msg}`);
  }

  obj(v: unknown, path: string): Obj | null {
    if (!isObj(v)) {
      this.err(path, "objektum várható");
      return null;
    }
    return v;
  }

  arr(v: unknown, path: string, max: number, min = 0): unknown[] {
    if (!Array.isArray(v)) {
      this.err(path, "lista várható");
      return [];
    }
    if (v.length > max) {
      this.err(path, `legfeljebb ${max} elem lehet`);
      return [];
    }
    if (v.length < min) this.err(path, `legalább ${min} elem kell`);
    return v;
  }

  str(o: Obj, key: string, path: string, max: number): string {
    const v = o[key];
    if (typeof v !== "string" || v.trim() === "") {
      this.err(`${path}.${key}`, "nem üres szöveg várható");
      return "";
    }
    if (v.length > max) this.err(`${path}.${key}`, `legfeljebb ${max} karakter lehet`);
    return v;
  }

  optStr(o: Obj, key: string, path: string, max: number): string | undefined {
    if (o[key] === undefined) return undefined;
    const v = o[key];
    if (typeof v !== "string") {
      this.err(`${path}.${key}`, "szöveg várható");
      return undefined;
    }
    if (v.length > max) this.err(`${path}.${key}`, `legfeljebb ${max} karakter lehet`);
    return v;
  }

  optDate(o: Obj, key: string, path: string): string | undefined {
    const v = this.optStr(o, key, path, 40);
    if (v !== undefined && !Number.isFinite(Date.parse(v))) this.err(`${path}.${key}`, "érvénytelen dátum");
    return v;
  }

  id(o: Obj, path: string): string {
    const v = o.id;
    if (typeof v !== "string" || !RULE_ID_RE.test(v) || v.length > 40) {
      this.err(`${path}.id`, "az azonosító kisbetűvel kezdődik, és csak a–z, 0–9, _ lehet benne (legfeljebb 40 karakter)");
      return typeof v === "string" ? v : "";
    }
    return v;
  }

  num(o: Obj, key: string, path: string, opts: { min?: number; max?: number; int?: boolean; gt?: number } = {}): number {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      this.err(`${path}.${key}`, "szám várható");
      return 0;
    }
    if (opts.int && !Number.isInteger(v)) this.err(`${path}.${key}`, "egész szám várható");
    if (opts.min !== undefined && v < opts.min) this.err(`${path}.${key}`, `legalább ${opts.min} lehet`);
    if (opts.gt !== undefined && v <= opts.gt) this.err(`${path}.${key}`, `nagyobb kell legyen, mint ${opts.gt}`);
    if (opts.max !== undefined && v > opts.max) this.err(`${path}.${key}`, `legfeljebb ${opts.max} lehet`);
    return v;
  }

  optNum(o: Obj, key: string, path: string, opts: { min?: number; max?: number; int?: boolean; gt?: number } = {}): number | undefined {
    return o[key] === undefined ? undefined : this.num(o, key, path, opts);
  }

  bool(o: Obj, key: string, path: string): boolean {
    const v = o[key];
    if (typeof v !== "boolean") {
      this.err(`${path}.${key}`, "igaz/hamis érték várható");
      return false;
    }
    return v;
  }

  oneOf<T extends string>(o: Obj, key: string, path: string, allowed: readonly T[]): T {
    const v = o[key];
    if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
      this.err(`${path}.${key}`, `ezek egyike várható: ${allowed.join(", ")}`);
      return allowed[0];
    }
    return v as T;
  }
}

function uniqueIds(ctx: Ctx, items: { id: string }[], path: string, what: string): void {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) ctx.err(path, `ismétlődő ${what}: „${it.id}”`);
    seen.add(it.id);
  }
}

function parts(ctx: Ctx, v: unknown, path: string, max: number): Part[] | undefined {
  if (v === undefined) return undefined;
  const out: Part[] = [];
  ctx.arr(v, path, RULE_LIMITS.parts, 1).forEach((raw, i) => {
    const p = `${path}[${i}]`;
    const o = ctx.obj(raw, p);
    if (!o) return;
    const part: Part = { id: ctx.id(o, p), label: ctx.str(o, "label", p, RULE_LIMITS.label), max: ctx.num(o, "max", p, { gt: 0, max }) };
    const passAt = ctx.optNum(o, "passAt", p, { min: 0, max: part.max });
    if (passAt !== undefined) part.passAt = passAt;
    out.push(part);
  });
  uniqueIds(ctx, out, path, "részpontszám");
  const sum = out.reduce((s, x) => s + x.max, 0);
  if (out.length && Math.abs(sum - max) > 1e-9) ctx.warnings.push(`${path}: a részpontszámok összege (${sum}) nem egyezik a maximummal (${max})`);
  return out;
}

function scale(ctx: Ctx, v: unknown, path: string): Scale {
  const o = ctx.obj(v, path);
  if (!o) return { kind: "grade" };
  const kind = ctx.oneOf(o, "kind", path, ["points", "grade"] as const);
  if (kind === "grade") {
    const s: Scale = { kind: "grade" };
    const passAt = ctx.optNum(o, "passAt", path, { min: 1, max: 5, int: true });
    if (passAt !== undefined) s.passAt = passAt;
    return s;
  }
  const max = ctx.num(o, "max", path, { gt: 0, max: RULE_LIMITS.maxPoints });
  const s: Scale = { kind: "points", max };
  const step = ctx.optNum(o, "step", path, { gt: 0, max });
  if (step !== undefined) s.step = step;
  const passAt = ctx.optNum(o, "passAt", path, { min: 0, max });
  if (passAt !== undefined) s.passAt = passAt;
  const ps = parts(ctx, o.parts, `${path}.parts`, max);
  if (ps) s.parts = ps;
  return s;
}

function scoring(ctx: Ctx, v: unknown, path: string): SeriesScoring {
  const o = ctx.obj(v, path);
  if (!o) return { kind: "plusMinus" };
  const kind = ctx.oneOf(o, "kind", path, ["points", "plusMinus", "percent"] as const);
  if (kind === "plusMinus") return { kind };
  if (kind === "percent") {
    const s: SeriesScoring = { kind, passAt: ctx.num(o, "passAt", path, { min: 0, max: 100 }), onTimeOnly: ctx.bool(o, "onTimeOnly", path) };
    const attempts = ctx.optNum(o, "attempts", path, { min: 1, max: 100, int: true });
    if (attempts !== undefined) s.attempts = attempts;
    return s;
  }
  const max = ctx.num(o, "max", path, { gt: 0, max: RULE_LIMITS.maxPoints });
  const s: SeriesScoring = { kind: "points", max };
  const step = ctx.optNum(o, "step", path, { gt: 0, max });
  if (step !== undefined) s.step = step;
  const ps = parts(ctx, o.parts, `${path}.parts`, max);
  if (ps) s.parts = ps;
  return s;
}

function component(ctx: Ctx, raw: unknown, path: string): RuleComponent | null {
  const o = ctx.obj(raw, path);
  if (!o) return null;
  const kind = o.kind;
  const base = { id: ctx.id(o, path), label: ctx.str(o, "label", path, RULE_LIMITS.label) };
  const note = ctx.optStr(o, "note", path, RULE_LIMITS.note);
  const withNote = <T extends object>(c: T): T => (note !== undefined ? { ...c, note } : c);
  switch (kind) {
    case "attendance": {
      const c: RuleComponent = { ...base, kind };
      if (o.limit !== undefined) {
        const l = ctx.obj(o.limit, `${path}.limit`);
        if (l) {
          c.limit = {
            maxAbsences: ctx.num(l, "maxAbsences", `${path}.limit`, { min: 0, max: 1000, int: true }),
            countExcused: ctx.bool(l, "countExcused", `${path}.limit`),
            onExceed: ctx.oneOf(l, "onExceed", `${path}.limit`, ["none", "fail"] as const),
          };
        }
      }
      return withNote(c);
    }
    case "exam": {
      const c: RuleComponent = { ...base, kind, scale: scale(ctx, o.scale, `${path}.scale`) };
      const due = ctx.optDate(o, "due", path);
      if (due !== undefined) c.due = due;
      return withNote(c);
    }
    case "assignment": {
      const outs: AssignmentOutcome[] = [];
      ctx.arr(o.outcomes, `${path}.outcomes`, RULE_LIMITS.assignmentOutcomes, 1).forEach((r, i) => {
        const p = `${path}.outcomes[${i}]`;
        const oo = ctx.obj(r, p);
        if (!oo) return;
        outs.push({
          id: ctx.id(oo, p),
          label: ctx.str(oo, "label", p, RULE_LIMITS.label),
          points: ctx.num(oo, "points", p, { min: -RULE_LIMITS.maxPoints, max: RULE_LIMITS.maxPoints }),
          accepted: ctx.bool(oo, "accepted", p),
        });
      });
      uniqueIds(ctx, outs, `${path}.outcomes`, "kimenet");
      const c: RuleComponent = { ...base, kind, outcomes: outs };
      const due = ctx.optDate(o, "due", path);
      if (due !== undefined) c.due = due;
      return withNote(c);
    }
    case "series":
      return withNote({
        ...base,
        kind,
        item: ctx.oneOf(o, "item", path, ["ropzh", "quiz"] as const),
        count: ctx.num(o, "count", path, { min: 1, max: RULE_LIMITS.seriesCount, int: true }),
        scoring: scoring(ctx, o.scoring, `${path}.scoring`),
      });
    case "bonus": {
      const c: RuleComponent = { ...base, kind };
      const cap = ctx.optNum(o, "cap", path, { min: 0, max: RULE_LIMITS.maxPoints });
      if (cap !== undefined) c.cap = cap;
      const closesAt = ctx.optDate(o, "closesAt", path);
      if (closesAt !== undefined) c.closesAt = closesAt;
      return withNote(c);
    }
    default:
      ctx.err(`${path}.kind`, "ismeretlen összetevőtípus");
      return null;
  }
}

function formula(ctx: Ctx, o: Obj, key: string, path: string, optional: boolean): string | undefined {
  const v = o[key];
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string") {
    ctx.err(`${path}.${key}`, "képlet (szöveg) várható");
    return undefined;
  }
  const res = parseFormula(v);
  if (!res.ok) {
    ctx.err(`${path}.${key}`, `${res.error.message} (${res.error.at + 1}. karakter)`);
    return undefined;
  }
  return v;
}

function gates(ctx: Ctx, v: unknown, path: string): Gate[] | undefined {
  if (v === undefined) return undefined;
  const out: Gate[] = [];
  ctx.arr(v, path, RULE_LIMITS.gates).forEach((r, i) => {
    const p = `${path}[${i}]`;
    const o = ctx.obj(r, p);
    if (!o) return;
    out.push({
      id: ctx.id(o, p),
      label: ctx.str(o, "label", p, RULE_LIMITS.label),
      test: formula(ctx, o, "test", p, false) ?? "",
      onFail: ctx.oneOf(o, "onFail", p, ["none", "fail"] as const),
    });
  });
  return out;
}

function post(ctx: Ctx, v: unknown, path: string): PostStep[] | undefined {
  if (v === undefined) return undefined;
  const out: PostStep[] = [];
  ctx.arr(v, path, RULE_LIMITS.postSteps).forEach((r, i) => {
    const p = `${path}[${i}]`;
    const o = ctx.obj(r, p);
    if (!o) return;
    const kind = ctx.oneOf(o, "kind", p, ["cap", "add"] as const);
    if (kind === "cap") out.push({ kind, max: ctx.num(o, "max", p, { min: 1, max: 5, int: true }) });
    else
      out.push({
        kind,
        when: formula(ctx, o, "when", p, false) ?? "",
        delta: ctx.num(o, "delta", p, { min: -4, max: 4, int: true }),
        label: ctx.str(o, "label", p, RULE_LIMITS.label),
      });
  });
  return out;
}

function outcome(ctx: Ctx, raw: unknown, path: string): Outcome | null {
  const o = ctx.obj(raw, path);
  if (!o) return null;
  const out: Outcome = {
    id: ctx.id(o, path),
    label: ctx.str(o, "label", path, RULE_LIMITS.label),
    kind: ctx.oneOf(o, "kind", path, ["gyakorlat", "vizsga", "megajanlott"] as const),
    select: ctx.oneOf(o, "select", path, ["first", "best"] as const),
    paths: [],
  };
  const g = gates(ctx, o.gates, `${path}.gates`);
  if (g) out.gates = g;
  ctx.arr(o.paths, `${path}.paths`, RULE_LIMITS.paths, 1).forEach((r, i) => {
    const p = `${path}.paths[${i}]`;
    const po = ctx.obj(r, p);
    if (!po) return;
    const gp: GradePath = { id: ctx.id(po, p), label: ctx.str(po, "label", p, RULE_LIMITS.label), grade: formula(ctx, po, "grade", p, false) ?? "" };
    const when = formula(ctx, po, "when", p, true);
    if (when !== undefined) gp.when = when;
    const pg = gates(ctx, po.gates, `${p}.gates`);
    if (pg) {
      gp.gates = pg;
      uniqueIds(ctx, [...(out.gates ?? []), ...pg], `${p}.gates`, "feltétel");
    }
    const ps = post(ctx, po.post, `${p}.post`);
    if (ps) gp.post = ps;
    out.paths.push(gp);
  });
  uniqueIds(ctx, out.gates ?? [], `${path}.gates`, "feltétel");
  uniqueIds(ctx, out.paths, `${path}.paths`, "út");
  return out;
}

// ----- reference resolution -----

interface Names {
  comps: Map<string, RuleComponent>;
  derived: string[];
  tables: Set<string>;
  outcomes: string[];
  retakes: Set<string>;
}

const PRED_OK: Record<string, readonly Pred[]> = {
  exam: ["passed", "failed"],
  assignment: ["passed", "failed"],
  attendance: ["absent", "excused", "unexcused"],
  plusMinus: ["plus", "minus", "passed", "failed"],
  percent: ["passed", "failed"],
  points: [],
  bonus: [],
};

function partsOf(c: RuleComponent): Part[] | undefined {
  if (c.kind === "exam" && c.scale.kind === "points") return c.scale.parts;
  if (c.kind === "series" && c.scoring.kind === "points") return c.scoring.parts;
  return undefined;
}

function makeScope(
  n: Names,
  opts: { derivedUpTo: number; outcomesUpTo: number; allowTaken: boolean; allowTables: boolean }
): FormulaScope {
  const derived = new Set(n.derived.slice(0, opts.derivedUpTo));
  const outcomes = new Set(n.outcomes.slice(0, opts.outcomesUpTo));
  const partCheck = (id: string, part?: string): string | null => {
    const c = n.comps.get(id)!;
    if (part === undefined) return null;
    const ps = partsOf(c);
    if (!ps?.some((p) => p.id === part)) return `„${id}” összetevőnek nincs „${part}” része`;
    return null;
  };
  return {
    ref(id, part) {
      if (n.comps.has(id)) return partCheck(id, part);
      if (derived.has(id)) return part ? `„${id}” számított értéknek nincsenek részei` : null;
      if (n.derived.includes(id)) return `„${id}” csak később van definiálva`;
      if (n.retakes.has(id)) return `„${id}” javító: használd a taken(${id}) formát`;
      return `Ismeretlen azonosító: „${id}”`;
    },
    raw(id, part) {
      const c = n.comps.get(id);
      if (!c || c.kind !== "exam") return `A raw() csak zh/vizsga összetevőt fogad: „${id}”`;
      return partCheck(id, part);
    },
    count(pred, id) {
      const c = n.comps.get(id);
      if (!c) return `A count() csak összetevőt fogad: „${id}”`;
      const key = c.kind === "series" ? c.scoring.kind : c.kind;
      if (!PRED_OK[key].includes(pred)) return `„${pred}” nem értelmezhető ennél az összetevőnél: „${id}”`;
      return null;
    },
    table(id) {
      if (!opts.allowTables) return "Itt nem használható táblázat";
      return n.tables.has(id) ? null : `Ismeretlen táblázat: „${id}”`;
    },
    grade(id) {
      if (outcomes.has(id)) return null;
      if (n.outcomes.includes(id)) return `grade(${id}): csak korábbi jegyre lehet hivatkozni`;
      return opts.outcomesUpTo === 0 ? "Itt nem használható a grade()" : `Ismeretlen jegy: „${id}”`;
    },
    taken(id) {
      if (!opts.allowTaken) return "Itt nem használható a taken()";
      return n.retakes.has(id) ? null : `Ismeretlen javító: „${id}”`;
    },
  };
}

function checkRefs(ctx: Ctx, src: string | undefined, path: string, scope: FormulaScope): void {
  if (!src) return;
  const res = parseFormula(src);
  if (!res.ok) return;
  for (const e of checkFormula(res.ast, scope)) ctx.err(path, `${e.message} (${e.at + 1}. karakter)`);
}

// ----- polarity -----

function polarityWarnings(rules: SubjectRules): string[] {
  const comps = new Map(rules.components.map((c) => [c.id, c]));
  const derivedAst = new Map<string, Ast>();
  for (const d of rules.derived) {
    const r = parseFormula(d.expr);
    if (r.ok) derivedAst.set(d.id, r.ast);
  }
  const tables = new Map(rules.tables.map((t) => [t.id, t]));
  const PRED_SIGN: Record<Pred, number> = { passed: 1, plus: 1, failed: -1, minus: -1, absent: -1, excused: -1, unexcused: -1 };

  const walk = (a: Ast, sign: number, bad: Set<string>, depth: number): void => {
    if (depth > 40) return;
    switch (a.k) {
      case "num":
      case "grade":
      case "taken":
        return;
      case "ref":
      case "raw": {
        const c = comps.get(a.id);
        if (c) {
          if ((c.kind === "attendance" ? -1 : 1) * sign < 0) bad.add(a.id);
        } else if (derivedAst.has(a.id)) walk(derivedAst.get(a.id)!, sign, bad, depth + 1);
        return;
      }
      case "count":
        if (PRED_SIGN[a.pred] * sign < 0) a.ids.forEach((id) => bad.add(id));
        return;
      case "neg":
      case "not":
        return walk(a.e, -sign, bad, depth + 1);
      case "table": {
        const t = tables.get(a.table);
        const monotone = !t || t.rows.every((r, i) => i === 0 || r.value >= t.rows[i - 1].value);
        if (!monotone) {
          walk(a.e, sign, bad, depth + 1);
          walk(a.e, -sign, bad, depth + 1);
        } else walk(a.e, sign, bad, depth + 1);
        return;
      }
      case "fn":
        if (a.fn === "if") {
          const [c, t, e] = a.args;
          const flip = t.k === "num" && e.k === "num" && t.v < e.v;
          walk(c, flip ? -sign : sign, bad, depth + 1);
          walk(t, sign, bad, depth + 1);
          walk(e, sign, bad, depth + 1);
          return;
        }
        a.args.forEach((x) => walk(x, sign, bad, depth + 1));
        return;
      case "bin":
        switch (a.op) {
          case "+":
          case "&&":
          case "||":
            walk(a.l, sign, bad, depth + 1);
            walk(a.r, sign, bad, depth + 1);
            return;
          case "-":
            walk(a.l, sign, bad, depth + 1);
            walk(a.r, -sign, bad, depth + 1);
            return;
          case "*": {
            const k = a.l.k === "num" ? a.l.v : a.r.k === "num" ? a.r.v : 1;
            const s = k < 0 ? -sign : sign;
            walk(a.l, s, bad, depth + 1);
            walk(a.r, s, bad, depth + 1);
            return;
          }
          case "/":
            walk(a.l, sign, bad, depth + 1);
            return;
          case ">=":
          case ">":
            walk(a.l, sign, bad, depth + 1);
            walk(a.r, -sign, bad, depth + 1);
            return;
          case "<=":
          case "<":
            walk(a.l, -sign, bad, depth + 1);
            walk(a.r, sign, bad, depth + 1);
            return;
          case "==":
          case "!=": {
            // "x == 0" behaves like "x <= 0" and "x == c" like "x >= c" for counts; "!=" flips.
            const constSide = a.r.k === "num" ? a.r : a.l.k === "num" ? a.l : null;
            const other = constSide === a.r ? a.l : a.r;
            if (!constSide) {
              for (const s of [sign, -sign]) {
                walk(a.l, s, bad, depth + 1);
                walk(a.r, s, bad, depth + 1);
              }
              return;
            }
            let s = constSide.v <= 0 ? -sign : sign;
            if (a.op === "!=") s = -s;
            walk(other, s, bad, depth + 1);
            return;
          }
        }
    }
  };

  const warnings: string[] = [];
  const check = (src: string | undefined, expected: number, path: string) => {
    if (!src) return;
    const r = parseFormula(src);
    if (!r.ok) return;
    const bad = new Set<string>();
    walk(r.ast, expected, bad, 0);
    if (bad.size) {
      warnings.push(`${path}: a képlet nem monoton – ${[...bad].map((x) => `„${x}”`).join(", ")} javulása ronthatja az eredményt (a határok becslések)`);
    }
  };
  rules.outcomes.forEach((o) => {
    o.gates?.forEach((g) => check(g.test, 1, `outcomes.${o.id}.gates.${g.id}`));
    o.paths.forEach((p) => {
      const base = `outcomes.${o.id}.paths.${p.id}`;
      p.gates?.forEach((g) => check(g.test, 1, `${base}.gates.${g.id}`));
      check(p.grade, 1, `${base}.grade`);
      p.post?.forEach((s, i) => {
        if (s.kind === "add") check(s.when, s.delta >= 0 ? 1 : -1, `${base}.post[${i}].when`);
      });
    });
  });
  return warnings;
}

// ----- entry point -----

export function validateRules(value: unknown): ValidateResult {
  const ctx = new Ctx();
  const root = ctx.obj(value, "szabályok");
  if (!root) return { ok: false, errors: ctx.errors };
  if (root.schemaVersion !== 1) ctx.err("schemaVersion", "csak az 1-es verzió támogatott");

  const components: RuleComponent[] = [];
  ctx.arr(root.components, "components", RULE_LIMITS.components).forEach((r, i) => {
    const c = component(ctx, r, `components[${i}]`);
    if (c) components.push(c);
  });
  const comps = new Map(components.map((c) => [c.id, c]));

  const retakes: RetakeSlot[] = [];
  ctx.arr(root.retakes, "retakes", RULE_LIMITS.retakes).forEach((r, i) => {
    const p = `retakes[${i}]`;
    const o = ctx.obj(r, p);
    if (!o) return;
    const targets: string[] = [];
    ctx.arr(o.targets, `${p}.targets`, RULE_LIMITS.retakeTargets, 1).forEach((t, j) => {
      if (typeof t !== "string") return ctx.err(`${p}.targets[${j}]`, "azonosító várható");
      const c = comps.get(t);
      if (!c || c.kind !== "exam") return ctx.err(`${p}.targets[${j}]`, `„${t}” nem zh/vizsga összetevő`);
      if (targets.includes(t)) return ctx.err(`${p}.targets[${j}]`, `„${t}” kétszer szerepel`);
      targets.push(t);
    });
    const scales = new Set(targets.map((t) => JSON.stringify((comps.get(t) as { scale: Scale }).scale)));
    if (scales.size > 1) ctx.err(`${p}.targets`, "a célok pontozása eltér, egy javító csak azonos pontozású zh-kat válthat ki");
    const slot: RetakeSlot = {
      id: ctx.id(o, p),
      label: ctx.str(o, "label", p, RULE_LIMITS.label),
      targets,
      pick: ctx.oneOf(o, "pick", p, ["worse", "failed", "choose"] as const),
      mode: ctx.oneOf(o, "mode", p, ["replace", "ifBetter"] as const),
    };
    const eligible = formula(ctx, o, "eligible", p, true);
    if (eligible !== undefined) slot.eligible = eligible;
    const due = ctx.optDate(o, "due", p);
    if (due !== undefined) slot.due = due;
    retakes.push(slot);
  });

  const derived: Derived[] = [];
  ctx.arr(root.derived, "derived", RULE_LIMITS.derived).forEach((r, i) => {
    const p = `derived[${i}]`;
    const o = ctx.obj(r, p);
    if (!o) return;
    derived.push({ id: ctx.id(o, p), label: ctx.str(o, "label", p, RULE_LIMITS.label), expr: formula(ctx, o, "expr", p, false) ?? "" });
  });

  const tables: GradeTable[] = [];
  ctx.arr(root.tables, "tables", RULE_LIMITS.tables).forEach((r, i) => {
    const p = `tables[${i}]`;
    const o = ctx.obj(r, p);
    if (!o) return;
    const rows = ctx.arr(o.rows, `${p}.rows`, RULE_LIMITS.tableRows, 1).flatMap((rr, j) => {
      const ro = ctx.obj(rr, `${p}.rows[${j}]`);
      if (!ro) return [];
      return [{ min: ctx.num(ro, "min", `${p}.rows[${j}]`, { min: -1e6, max: 1e6 }), value: ctx.num(ro, "value", `${p}.rows[${j}]`, { min: -1e6, max: 1e6 }) }];
    });
    rows.forEach((row, j) => {
      if (j > 0 && row.min <= rows[j - 1].min) ctx.err(`${p}.rows[${j}].min`, "a sorok határai szigorúan növekvő sorrendben kellenek");
    });
    tables.push({ id: ctx.id(o, p), rows });
  });

  const outcomes: Outcome[] = [];
  ctx.arr(root.outcomes, "outcomes", RULE_LIMITS.outcomes).forEach((r, i) => {
    const o = outcome(ctx, r, `outcomes[${i}]`);
    if (o) outcomes.push(o);
  });

  const flags: RuleFlag[] = [];
  ctx.arr(root.flags, "flags", RULE_LIMITS.flags).forEach((r, i) => {
    const p = `flags[${i}]`;
    const o = ctx.obj(r, p);
    if (!o) return;
    flags.push({
      field: ctx.str(o, "field", p, RULE_LIMITS.flagField),
      message: ctx.str(o, "message", p, RULE_LIMITS.flagMessage),
      resolved: ctx.bool(o, "resolved", p),
    });
  });

  // One namespace for components, retakes, derived values, tables and outcomes.
  const seen = new Set<string>();
  for (const [what, items] of [
    ["összetevő", components],
    ["javító", retakes],
    ["számított érték", derived],
    ["táblázat", tables],
    ["jegy", outcomes],
  ] as const) {
    for (const it of items) {
      if (seen.has(it.id)) ctx.err(what, `az azonosító már foglalt: „${it.id}”`);
      seen.add(it.id);
    }
  }

  if (ctx.errors.length) return { ok: false, errors: ctx.errors };

  const names: Names = {
    comps,
    derived: derived.map((d) => d.id),
    tables: new Set(tables.map((t) => t.id)),
    outcomes: outcomes.map((o) => o.id),
    retakes: new Set(retakes.map((r) => r.id)),
  };
  retakes.forEach((r) =>
    checkRefs(ctx, r.eligible, `retakes.${r.id}.eligible`, makeScope(names, { derivedUpTo: 0, outcomesUpTo: 0, allowTaken: false, allowTables: false }))
  );
  derived.forEach((d, i) =>
    checkRefs(ctx, d.expr, `derived.${d.id}.expr`, makeScope(names, { derivedUpTo: i, outcomesUpTo: 0, allowTaken: true, allowTables: true }))
  );
  outcomes.forEach((o, i) => {
    const scope = makeScope(names, { derivedUpTo: derived.length, outcomesUpTo: i, allowTaken: true, allowTables: true });
    o.gates?.forEach((g) => checkRefs(ctx, g.test, `outcomes.${o.id}.gates.${g.id}`, scope));
    o.paths.forEach((p) => {
      const base = `outcomes.${o.id}.paths.${p.id}`;
      checkRefs(ctx, p.when, `${base}.when`, scope);
      p.gates?.forEach((g) => checkRefs(ctx, g.test, `${base}.gates.${g.id}`, scope));
      checkRefs(ctx, p.grade, `${base}.grade`, scope);
      p.post?.forEach((s, j) => {
        if (s.kind === "add") checkRefs(ctx, s.when, `${base}.post[${j}].when`, scope);
      });
    });
  });
  if (ctx.errors.length) return { ok: false, errors: ctx.errors };

  const rules: SubjectRules = { schemaVersion: 1, components, retakes, derived, tables, outcomes, flags };
  return { ok: true, rules, warnings: [...ctx.warnings, ...polarityWarnings(rules)] };
}
