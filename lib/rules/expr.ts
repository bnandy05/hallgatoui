// Formula language of the requirement rules: a hand-written recursive-descent parser (no eval),
// an AST cached per source string, an evaluator over an environment, a reference checker for the
// validator and a short rendering for the review screen (Hungarian or English). Grammar (schema.md §1.1):
//
//   expr    := or
//   or      := and ( "||" and )*
//   and     := cmp ( "&&" cmp )*
//   cmp     := add ( ( "<=" | ">=" | "<" | ">" | "==" | "!=" ) add )?
//   add     := mul ( ( "+" | "-" ) mul )*
//   mul     := unary ( ( "*" | "/" ) unary )*
//   unary   := ( "-" | "!" ) unary | primary
//   primary := number | ref | call | "(" expr ")"
//
// Booleans are numbers: true is 1, false is 0.

import { getMessages, type Locale } from "@/lib/i18n";

export const MAX_FORMULA_LENGTH = 300;
export const MAX_FORMULA_DEPTH = 24;

export type Pred = "passed" | "failed" | "plus" | "minus" | "absent" | "excused" | "unexcused";
export const PREDICATES: readonly Pred[] = ["passed", "failed", "plus", "minus", "absent", "excused", "unexcused"];

export type BinOp = "||" | "&&" | "<=" | ">=" | "<" | ">" | "==" | "!=" | "+" | "-" | "*" | "/";
export type MathFn = "floor" | "min" | "max" | "if";

export type Ast =
  | { k: "num"; v: number }
  | { k: "ref"; id: string; part?: string; at: number }
  | { k: "raw"; id: string; part?: string; at: number }
  | { k: "neg"; e: Ast }
  | { k: "not"; e: Ast }
  | { k: "bin"; op: BinOp; l: Ast; r: Ast; at: number }
  | { k: "fn"; fn: MathFn; args: Ast[]; at: number }
  | { k: "count"; raw: boolean; pred: Pred; ids: string[]; at: number }
  | { k: "table"; table: string; e: Ast; at: number }
  | { k: "grade"; outcome: string; at: number }
  | { k: "taken"; retake: string; at: number };

export interface FormulaError {
  at: number;
  message: string;
}

export type ParseResult = { ok: true; ast: Ast } | { ok: false; error: FormulaError };

const FUNCTIONS = new Set(["floor", "min", "max", "if", "raw", "count", "countRaw", "table", "grade", "taken"]);

// ----- tokenizer -----

type Tok =
  | { t: "num"; v: number; at: number }
  | { t: "id"; v: string; at: number }
  | { t: "op"; v: string; at: number }
  | { t: "end"; at: number };

const TWO_CHAR = new Set(["||", "&&", "<=", ">=", "==", "!="]);
const ONE_CHAR = new Set(["<", ">", "+", "-", "*", "/", "!", "(", ")", ",", "."]);

class ParseError extends Error {
  at: number;
  constructor(at: number, message: string) {
    super(message);
    this.at = at;
  }
}

type ParseMessages = ReturnType<typeof getMessages>["rules"]["formula"]["parse"];

function tokenize(src: string, m: ParseMessages): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: "num", v: Number(m[0]), at: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR.has(two)) {
      out.push({ t: "op", v: two, at: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR.has(c)) {
      out.push({ t: "op", v: c, at: i });
      i++;
      continue;
    }
    throw new ParseError(i, m.unknownChar(c));
  }
  out.push({ t: "end", at: src.length });
  return out;
}

// ----- parser -----

class Parser {
  private toks: Tok[];
  private i = 0;
  private depth = 0;
  private m: ParseMessages;

  constructor(toks: Tok[], m: ParseMessages) {
    this.toks = toks;
    this.m = m;
  }

  private peek(): Tok {
    return this.toks[this.i];
  }

  private next(): Tok {
    return this.toks[this.i++];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }

  private expectOp(v: string): void {
    const t = this.peek();
    if (t.t === "op" && t.v === v) {
      this.i++;
      return;
    }
    throw this.unexpected(this.m.missing(v));
  }

  private unexpected(expected?: string): ParseError {
    const t = this.peek();
    const m = this.m;
    if (t.t === "end") return new ParseError(t.at, expected ? m.unexpectedEndExpected(expected) : m.unexpectedEnd);
    const shown = t.t === "num" ? String(t.v) : t.v;
    return new ParseError(t.at, expected ? m.unexpectedExpected(shown, expected) : m.unexpected(shown));
  }

  private enter(at: number): void {
    if (++this.depth > MAX_FORMULA_DEPTH) {
      throw new ParseError(at, this.m.tooDeep(MAX_FORMULA_DEPTH));
    }
  }

  parse(): Ast {
    const ast = this.expr();
    const t = this.peek();
    if (t.t !== "end") throw this.unexpected(this.m.endExpected);
    return ast;
  }

  private expr(): Ast {
    this.enter(this.peek().at);
    const e = this.or();
    this.depth--;
    return e;
  }

  private or(): Ast {
    let l = this.and();
    while (this.isOp("||")) {
      const at = this.next().at;
      l = { k: "bin", op: "||", l, r: this.and(), at };
    }
    return l;
  }

  private and(): Ast {
    let l = this.cmp();
    while (this.isOp("&&")) {
      const at = this.next().at;
      l = { k: "bin", op: "&&", l, r: this.cmp(), at };
    }
    return l;
  }

  private cmp(): Ast {
    const l = this.add();
    const t = this.peek();
    if (t.t === "op" && ["<=", ">=", "<", ">", "==", "!="].includes(t.v)) {
      this.i++;
      const r = this.add();
      const after = this.peek();
      if (after.t === "op" && ["<=", ">=", "<", ">", "==", "!="].includes(after.v)) {
        throw new ParseError(after.at, this.m.twoComparisons);
      }
      return { k: "bin", op: t.v as BinOp, l, r, at: t.at };
    }
    return l;
  }

  private add(): Ast {
    let l = this.mul();
    for (;;) {
      const t = this.peek();
      if (t.t === "op" && (t.v === "+" || t.v === "-")) {
        this.i++;
        l = { k: "bin", op: t.v, l, r: this.mul(), at: t.at };
      } else return l;
    }
  }

  private mul(): Ast {
    let l = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t === "op" && (t.v === "*" || t.v === "/")) {
        this.i++;
        l = { k: "bin", op: t.v, l, r: this.unary(), at: t.at };
      } else return l;
    }
  }

  private unary(): Ast {
    const t = this.peek();
    if (t.t === "op" && (t.v === "-" || t.v === "!")) {
      this.i++;
      this.enter(t.at);
      const e = this.unary();
      this.depth--;
      return t.v === "-" ? { k: "neg", e } : { k: "not", e };
    }
    return this.primary();
  }

  private primary(): Ast {
    const t = this.peek();
    if (t.t === "num") {
      this.i++;
      return { k: "num", v: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      this.i++;
      const e = this.expr();
      this.expectOp(")");
      return e;
    }
    if (t.t === "id") {
      const after = this.toks[this.i + 1];
      if (after.t === "op" && after.v === "(") return this.call();
      return this.ref("ref");
    }
    throw this.unexpected(this.m.operandExpected);
  }

  private ident(what: string): { v: string; at: number } {
    const t = this.peek();
    if (t.t !== "id") throw this.unexpected(this.m.expectedWhat(what));
    this.i++;
    return t;
  }

  private ref(k: "ref" | "raw"): Ast {
    const id = this.ident(this.m.whatIdentifier);
    if (this.isOp(".")) {
      this.i++;
      const part = this.ident(this.m.whatPart);
      return { k, id: id.v, part: part.v, at: id.at };
    }
    return { k, id: id.v, at: id.at };
  }

  private call(): Ast {
    const name = this.next() as { t: "id"; v: string; at: number };
    const at = name.at;
    if (!FUNCTIONS.has(name.v)) throw new ParseError(at, this.m.unknownFunction(name.v));
    this.expectOp("(");
    this.enter(at);
    let ast: Ast;
    switch (name.v) {
      case "raw":
        ast = this.ref("raw");
        break;
      case "count":
      case "countRaw": {
        const p = this.ident(this.m.whatPredicate);
        if (!(PREDICATES as readonly string[]).includes(p.v)) {
          throw new ParseError(p.at, this.m.unknownPredicate(p.v, PREDICATES.join(", ")));
        }
        const ids: string[] = [];
        if (!this.isOp(",")) throw this.unexpected(this.m.oneComponentExpected);
        while (this.isOp(",")) {
          this.i++;
          ids.push(this.ident(this.m.whatComponent).v);
        }
        ast = { k: "count", raw: name.v === "countRaw", pred: p.v as Pred, ids, at };
        break;
      }
      case "table": {
        const id = this.ident(this.m.whatTable);
        this.expectOp(",");
        ast = { k: "table", table: id.v, e: this.expr(), at };
        break;
      }
      case "grade":
        ast = { k: "grade", outcome: this.ident(this.m.whatGrade).v, at };
        break;
      case "taken":
        ast = { k: "taken", retake: this.ident(this.m.whatRetake).v, at };
        break;
      default: {
        const args = [this.expr()];
        while (this.isOp(",")) {
          this.i++;
          args.push(this.expr());
        }
        const fn = name.v as MathFn;
        if (fn === "floor" && args.length !== 1) throw new ParseError(at, this.m.floorOne);
        if (fn === "if" && args.length !== 3) throw new ParseError(at, this.m.ifThree);
        ast = { k: "fn", fn, args, at };
      }
    }
    this.expectOp(")");
    this.depth--;
    return ast;
  }
}

const cache = new Map<string, ParseResult>();
const CACHE_LIMIT = 2000;

/** Parses a formula (cached per source string and language). Never throws. */
export function parseFormula(src: string, locale: Locale = "hu"): ParseResult {
  const key = `${locale}:${src}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = getMessages(locale).rules.formula.parse;
  let res: ParseResult;
  if (typeof src !== "string") {
    res = { ok: false, error: { at: 0, message: m.notText } };
  } else if (src.length > MAX_FORMULA_LENGTH) {
    res = { ok: false, error: { at: MAX_FORMULA_LENGTH, message: m.tooLong(MAX_FORMULA_LENGTH) } };
  } else if (src.trim() === "") {
    res = { ok: false, error: { at: 0, message: m.empty } };
  } else {
    try {
      res = { ok: true, ast: new Parser(tokenize(src, m), m).parse() };
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      res = { ok: false, error: { at: e.at, message: e.message } };
    }
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, res);
  return res;
}

// ----- evaluation -----

export interface FormulaEnv {
  ref(id: string, part?: string): number;
  raw(id: string, part?: string): number;
  count(pred: Pred, ids: string[], raw: boolean): number;
  table(id: string, x: number): number;
  grade(outcomeId: string): number;
  taken(retakeId: string): number;
}

export const EPS = 1e-9;

const truthy = (x: number) => Math.abs(x) > EPS;
const b = (x: boolean) => (x ? 1 : 0);

export function evalAst(ast: Ast, env: FormulaEnv): number {
  switch (ast.k) {
    case "num":
      return ast.v;
    case "ref":
      return env.ref(ast.id, ast.part);
    case "raw":
      return env.raw(ast.id, ast.part);
    case "neg":
      return -evalAst(ast.e, env);
    case "not":
      return b(!truthy(evalAst(ast.e, env)));
    case "count":
      return env.count(ast.pred, ast.ids, ast.raw);
    case "table":
      return env.table(ast.table, evalAst(ast.e, env));
    case "grade":
      return env.grade(ast.outcome);
    case "taken":
      return env.taken(ast.retake);
    case "fn": {
      if (ast.fn === "if") return truthy(evalAst(ast.args[0], env)) ? evalAst(ast.args[1], env) : evalAst(ast.args[2], env);
      const vals = ast.args.map((a) => evalAst(a, env));
      if (ast.fn === "floor") return Math.floor(vals[0] + EPS);
      return ast.fn === "min" ? Math.min(...vals) : Math.max(...vals);
    }
    case "bin": {
      if (ast.op === "&&") return b(truthy(evalAst(ast.l, env)) && truthy(evalAst(ast.r, env)));
      if (ast.op === "||") return b(truthy(evalAst(ast.l, env)) || truthy(evalAst(ast.r, env)));
      const l = evalAst(ast.l, env);
      const r = evalAst(ast.r, env);
      switch (ast.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return r === 0 ? 0 : l / r;
        case "<=":
          return b(l <= r + EPS);
        case ">=":
          return b(l >= r - EPS);
        case "<":
          return b(l < r - EPS);
        case ">":
          return b(l > r + EPS);
        case "==":
          return b(Math.abs(l - r) <= EPS);
        case "!=":
          return b(Math.abs(l - r) > EPS);
      }
    }
  }
}

// ----- reference checking (used by the validator) -----

/** Each method returns an error message, or null when the reference is fine. */
export interface FormulaScope {
  ref(id: string, part?: string): string | null;
  raw(id: string, part?: string): string | null;
  count(pred: Pred, id: string, raw: boolean): string | null;
  table(id: string): string | null;
  grade(outcomeId: string): string | null;
  taken(retakeId: string): string | null;
}

/** Checks every reference against a scope, and that every divisor is a positive constant. */
export function checkFormula(ast: Ast, scope: FormulaScope, locale: Locale = "hu"): FormulaError[] {
  const errors: FormulaError[] = [];
  const add = (at: number, msg: string | null) => {
    if (msg) errors.push({ at, message: msg });
  };
  const walk = (a: Ast): void => {
    switch (a.k) {
      case "num":
        return;
      case "ref":
        return add(a.at, scope.ref(a.id, a.part));
      case "raw":
        return add(a.at, scope.raw(a.id, a.part));
      case "neg":
      case "not":
        return walk(a.e);
      case "count":
        for (const id of a.ids) add(a.at, scope.count(a.pred, id, a.raw));
        return;
      case "table":
        add(a.at, scope.table(a.table));
        return walk(a.e);
      case "grade":
        return add(a.at, scope.grade(a.outcome));
      case "taken":
        return add(a.at, scope.taken(a.retake));
      case "fn":
        a.args.forEach(walk);
        return;
      case "bin":
        if (a.op === "/" && !(a.r.k === "num" && a.r.v > 0)) add(a.at, getMessages(locale).rules.formula.positiveDivisor);
        walk(a.l);
        walk(a.r);
    }
  };
  walk(ast);
  return errors;
}

/** Ids of components/derived values the formula reads (refs, raw(), count()). */
export function collectRefs(ast: Ast, out: Set<string> = new Set()): Set<string> {
  switch (ast.k) {
    case "ref":
    case "raw":
      out.add(ast.id);
      break;
    case "count":
      ast.ids.forEach((id) => out.add(id));
      break;
    case "neg":
    case "not":
      collectRefs(ast.e, out);
      break;
    case "table":
      collectRefs(ast.e, out);
      break;
    case "fn":
      ast.args.forEach((x) => collectRefs(x, out));
      break;
    case "bin":
      collectRefs(ast.l, out);
      collectRefs(ast.r, out);
      break;
  }
  return out;
}

// ----- rendering (Hungarian or English) -----

const OP_TEXT = (locale: Locale): Record<BinOp, string> => {
  const t = getMessages(locale).rules.formula.describe;
  return {
    "||": t.or,
    "&&": t.and,
    "<=": "≤",
    ">=": "≥",
    "<": "<",
    ">": ">",
    "==": "=",
    "!=": "≠",
    "+": "+",
    "-": "−",
    "*": "·",
    "/": "/",
  };
};

const PREC: Record<BinOp, number> = {
  "||": 1,
  "&&": 2,
  "<=": 3,
  ">=": 3,
  "<": 3,
  ">": 3,
  "==": 3,
  "!=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
};

function fmtNum(v: number, locale: Locale): string {
  return locale === "hu" ? String(v).replace(".", ",") : String(v);
}

/**
 * A short rendering for the review screen, e.g. "floor((zh1+zh2+bonus)/20)" →
 * "(ZH1 + ZH2 + bónusz) / 20, lefelé kerekítve". `labels` maps ids (and "id.part") to names;
 * unknown ids are shown as they are. An unparsable formula is returned unchanged.
 */
export function describeFormula(src: string, labels: Record<string, string> = {}, locale: Locale = "hu"): string {
  const parsed = parseFormula(src, locale);
  if (!parsed.ok) return src;
  const t = getMessages(locale).rules.formula.describe;
  const ops = OP_TEXT(locale);
  const L = (id: string) => labels[id] ?? id;
  const refText = (id: string, part?: string) =>
    part ? labels[`${id}.${part}`] ?? `${L(id)} (${labels[part] ?? part})` : L(id);

  const prec = (a: Ast): number => (a.k === "bin" ? PREC[a.op] : 9);
  const render = (a: Ast): string => {
    switch (a.k) {
      case "num":
        return fmtNum(a.v, locale);
      case "ref":
        return refText(a.id, a.part);
      case "raw":
        return t.raw(refText(a.id, a.part));
      case "neg":
        return `−${wrap(a.e, 6)}`;
      case "not":
        return t.not(wrap(a.e, 6));
      case "count":
        return t.count(a.raw, t.predicates[a.pred], a.ids.map(L).join(", "));
      case "table":
        return t.table(L(a.table), render(a.e));
      case "grade":
        return t.grade(L(a.outcome));
      case "taken":
        return t.taken(L(a.retake));
      case "fn":
        if (a.fn === "if") return t.cond(render(a.args[0]), render(a.args[1]), render(a.args[2]));
        if (a.fn === "floor") return t.floorOf(render(a.args[0]));
        return t.pickOf(a.fn === "min", a.args.map(render).join("; "));
      case "bin": {
        const p = PREC[a.op];
        const rightStrict = a.op === "-" || a.op === "/" || p === 3;
        return `${wrap(a.l, p)} ${ops[a.op]} ${wrap(a.r, rightStrict ? p + 1 : p)}`;
      }
    }
  };
  const wrap = (a: Ast, min: number) => (prec(a) < min ? `(${render(a)})` : render(a));

  const ast = parsed.ast;
  if (ast.k === "fn" && ast.fn === "floor") return t.floorTail(render(ast.args[0]));
  return render(ast);
}
