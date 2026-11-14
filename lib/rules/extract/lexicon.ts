// The Hungarian pattern lexicon: reads requirement sentences into a draft model (component groups,
// gates, retakes, formulas, tables, outcomes). Pure and deterministic. It never decides between two
// readings: what the text leaves open is recorded as unknown, and assemble.ts turns it into a
// question (for Jev, then the student) or an "Ellenőrizd" flag. Every pattern runs on folded text
// (lower case, no accents) and keeps the sentence it came from as its quote.

import { GRADE, NUM, gradeAt, num, type Sentence } from "./text";

export type OnFail = "none" | "fail";

export interface PartDraft {
  id: string;
  label: string;
  max: number;
  passAt?: number;
}

export type NounKey =
  | "beadando"
  | "gyzh"
  | "elmzh"
  | "nagyzh"
  | "zh"
  | "ropzh"
  | "kviz"
  | "gyakuv"
  | "elo"
  | "szobeli";

export interface Group {
  key: NounKey;
  kind: "assignment" | "exam" | "series";
  label: string; // singular, lower case ("gyakorlati zh")
  idBase: string;
  count?: number;
  max?: number; // points per item
  grade?: boolean; // 1–5 scale
  passAt?: number;
  passAtExplicit?: boolean; // "legalább N ponttal teljesíthető"
  parts?: PartDraft[];
  partsAssumed?: string; // flag text when the split is not stated
  weight: number;
  plusMinus?: boolean;
  percent?: { passAt?: number; attempts?: number; onTimeOnly?: boolean };
  conversion?: { min: number; value: number }[]; // exam result → grade
  onTime?: number; // assignment: points accepted on time
  late?: number; // assignment: points accepted after the fix window
  cap?: number; // grade cap (elővizsga, gyakuv)
  quote: string;
}

export interface GateDraft {
  id: string;
  label: string;
  test: () => string; // resolved once every group's ids are known
  onFail?: OnFail;
  scope: "outcome" | "path";
  quote: string;
  group?: NounKey; // mustPass gates: the failure sentence may set onFail later
}

export interface RetakeDraft {
  id: string;
  label: string;
  groups: NounKey[];
  pick?: "worse" | "failed" | "choose";
  mode?: "replace" | "ifBetter";
  eligibleOneFailed?: boolean;
  quote: string;
}

export interface TableDraft {
  rows: { lo?: number; hi?: number; value: number }[];
  quote: string;
  after?: string; // id of the derived value defined just before the table, if any
}

export interface ModifierDraft {
  target: "main" | "elo" | "vizsga";
  when: () => string;
  delta: number;
  label: string;
  quote: string;
}

export interface FormulaDraft {
  id: string;
  label: string;
  expr: string; // in lexicon identifiers; resolved by assemble.ts
  quote: string;
}

export interface Draft {
  sentences: Sentence[];
  used: Set<number>;
  headings: Set<number>;
  groups: Map<NounKey, Group>;
  order: NounKey[];
  attendance?: { maxAbsences?: number; onExceed?: OnFail; countExcused?: boolean; unexcusedMinus?: boolean; quote: string };
  bonus?: { cap?: number; onlyIfPass?: boolean; quote: string };
  surplusBonus?: { over: number; quote: string }; // series points above N become bonus
  seriesPass?: { min: number; quote: string }; // the series component passes at N points
  pmGate?: { onFail?: OnFail; quote: string };
  quizMin?: { min: number; quote: string };
  gates: GateDraft[];
  retakes: RetakeDraft[];
  tables: TableDraft[];
  letters: Map<string, NounKey>; // "f" → a group key, from "F = a röpdolgozatok összpontszáma"
  formulas: FormulaDraft[]; // derived values in text order (Ö = …, összpontszám = …)
  gradeFormula?: { expr: string; quote: string };
  totalStated?: { value: number; quote: string };
  modifiers: ModifierDraft[];
  uv?: { group: NounKey; quote: string };
  exam?: { select: "best" | "first"; quote: string };
  megaj?: { conditions: { label: string; test: () => string }[]; quote: string };
}

// ----- nouns -----

interface Noun {
  key: NounKey;
  re: RegExp;
  kind: Group["kind"];
  label: string;
  idBase: string;
}

// Longest phrases first: a mention is masked before the shorter nouns are looked for.
const NOUNS: Noun[] = [
  { key: "gyakuv", re: /\b(?:gyakuv|gyakorlati utovizsga)\w*/g, kind: "exam", label: "gyakorlati utóvizsga", idBase: "gyakuv" },
  { key: "elo", re: /\belovizsga\w*/g, kind: "exam", label: "elővizsga", idBase: "elo" },
  { key: "szobeli", re: /\bszobeli\w*/g, kind: "exam", label: "szóbeli vizsga", idBase: "szobeli" },
  { key: "gyzh", re: /\bgyakorlati (?:zh|zarthelyi)\w*(?:-\w+)?/g, kind: "exam", label: "gyakorlati zh", idBase: "gy" },
  { key: "elmzh", re: /\belmeleti (?:zh|zarthelyi)\w*(?:-\w+)?/g, kind: "exam", label: "elméleti zh", idBase: "elm" },
  { key: "nagyzh", re: /\bnagy ?zh\w*(?:-\w+)?/g, kind: "exam", label: "nagyzh", idBase: "n" },
  { key: "ropzh", re: /\b(?:ropzh|rop ?dolgozat|kis ?zh|roplabda)\w*(?:-\w+)?/g, kind: "series", label: "röpzh", idBase: "rzh" },
  { key: "kviz", re: /\b(?:kviz|quiz)\w*(?:-\w+)?/g, kind: "series", label: "kvíz", idBase: "kviz" },
  { key: "beadando", re: /\bbeadando\w*/g, kind: "assignment", label: "beadandó", idBase: "b" },
  { key: "zh", re: /(?<![a-z])(?:zh|zarthelyi)(?![a-z])(?:-\w+)?/g, kind: "exam", label: "zh", idBase: "zh" },
];

const RETAKE_NOUN = /\b(?:pot ?zh|potdolgozat|pot ?zarthelyi|javito ?zh|javito ?zarthelyi|javito)\w*(?:-\w+)?/g;

interface Mention {
  key: NounKey;
  at: number;
  text: string;
}

/** Group nouns in text order (retake nouns are masked out, so "pótzh" is not a "zh"). */
export function mentions(f: string): Mention[] {
  let masked = f.replace(RETAKE_NOUN, (m) => " ".repeat(m.length));
  const out: Mention[] = [];
  for (const n of NOUNS) {
    masked = masked.replace(n.re, (m, at: number) => {
      out.push({ key: n.key, at, text: m });
      return " ".repeat(m.length);
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ----- small readers -----

const CONSEQ_NONE =
  /nincs (?:\w+ )?jegy|nem kap(?:hat)? (?:\w+ )?jegyet|nem szerezhet (?:\w+ )?jegyet|alairas\w* (?:megtagad|nem)|megtagad|jegy nelkul|nem teljesiti a targyat|nem kaphat/;
const CONSEQ_FAIL = /elegtelen|\b1-es\b|\(1\)|bukas|megbukik/;

/** "nincs jegy" → none, "elégtelen" → fail; nothing stated → undefined. */
export function consequence(f: string): OnFail | undefined {
  if (CONSEQ_NONE.test(f)) return "none";
  if (CONSEQ_FAIL.test(f)) return "fail";
  return undefined;
}

const ordinalLabel = (i: number, label: string) => `${i}. ${label}`;

export function groupIds(g: Group): string[] {
  if (g.kind === "series") return [g.idBase];
  const n = g.count ?? 1;
  if (n === 1) return [g.idBase];
  return Array.from({ length: n }, (_, i) => `${g.idBase}${i + 1}`);
}

export function groupLabels(g: Group): string[] {
  const cap = g.label.charAt(0).toUpperCase() + g.label.slice(1);
  if (g.kind === "series") return [cap];
  const n = g.count ?? 1;
  if (n === 1) return [cap];
  return Array.from({ length: n }, (_, i) => ordinalLabel(i + 1, g.label));
}

/** Exam groups that make up the practical grade (not the re-exam or the exam outcome). */
export function mainExams(d: Draft): Group[] {
  return d.order.map((k) => d.groups.get(k)!).filter((g) => g.kind === "exam" && !["gyakuv", "elo", "szobeli"].includes(g.key));
}

// ----- the lexicon -----

const DECLARE_VERB = /\b(?:irunk|irnak|iratunk|irjak|tartozik|tartoznak|kell elkesziteni|keszitenek|keszitunk|lesz|van)\b/;

export function readDraft(sentences: Sentence[]): Draft {
  const d: Draft = {
    sentences,
    used: new Set(),
    headings: new Set(),
    groups: new Map(),
    order: [],
    gates: [],
    retakes: [],
    tables: [],
    letters: new Map(),
    formulas: [],
    modifiers: [],
  };
  let table: TableDraft | null = null;
  let tableContext = "";

  for (const s of sentences) {
    const f = s.fold;
    const row = tableRow(f);
    if (row) {
      if (!table) table = { rows: [], quote: tableContext ? `${tableContext} ${s.text}` : s.text, after: d.formulas.at(-1)?.id };
      else table.quote += ` · ${s.text}`;
      table.rows.push(row);
      d.used.add(s.index);
      continue;
    }
    if (table) {
      d.tables.push(table);
      table = null;
    }
    tableContext = /:\s*$/.test(s.text) ? s.text : "";

    const hits = [
      declareAndDescribe(d, s),
      conversionTable(d, s),
      assignmentRules(d, s),
      attendanceRules(d, s),
      pmRule(d, s),
      quizRules(d, s),
      bonusRules(d, s),
      seriesRules(d, s),
      thresholdRules(d, s),
      failureRules(d, s),
      retakeRules(d, s),
      formulaRules(d, s),
      uvRules(d, s),
      examRules(d, s),
      megajRules(d, s),
      totalRule(d, s),
    ];
    if (hits.some(Boolean)) d.used.add(s.index);
    else if (isHeading(s)) d.headings.add(s.index);
  }
  if (table) d.tables.push(table);
  return d;
}

function isHeading(s: Sentence): boolean {
  const words = s.fold.split(" ").length;
  return words <= 12 && !/[.!?]$/.test(s.text.replace(/:$/, "")) && !/\d/.test(s.fold);
}

// --- tables ---

function tableRow(f: string): TableDraft["rows"][number] | null {
  const tail = `\\s*(?:pont\\w*)?\\s*[:=]?\\s*${GRADE}\\s*[.;]?$`;
  let m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*-\\s*(\\d+(?:[.,]\\d+)?)${tail}`).exec(f);
  if (m) return { lo: num(m[1]), hi: num(m[2]), value: gradeAt(m, 3)! };
  m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:pontig|-ig|ig)${tail}`).exec(f);
  if (m) return { hi: num(m[1]), value: gradeAt(m, 2)! };
  m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:ponttol|-tol|tol|\\+|ponttol felfele|-tol felfele)${tail}`).exec(f);
  if (m) return { lo: num(m[1]), value: gradeAt(m, 2)! };
  m = new RegExp(`^${GRADE}\\s*[:=]\\s*(\\d+(?:[.,]\\d+)?)\\s*-\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:pont\\w*)?\\s*[.;]?$`).exec(f);
  if (m) return { lo: num(m[5]), hi: num(m[6]), value: gradeAt(m, 1)! };
  return null;
}

/** "Az elméleti zh jegye: 27-től jeles (5), 24-től jó (4), …, alatta elégtelen (1)." */
function conversionTable(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/\bjegye\b/.test(f)) return false;
  const rows: { min: number; value: number }[] = [];
  const re = new RegExp(`(\\d+)\\s*-?\\s*(?:tol|ponttol)\\s+${GRADE}`, "g");
  for (const m of f.matchAll(re)) rows.push({ min: Number(m[1]), value: gradeAt(m, 2)! });
  if (rows.length < 2) return false;
  const g = mentions(f).map((x) => d.groups.get(x.key)).find((x) => x?.kind === "exam");
  if (!g) return false;
  if (new RegExp(`alatta\\s+${GRADE}`).test(f) || !rows.some((r) => r.min === 0)) rows.push({ min: 0, value: 1 });
  g.conversion = rows.sort((a, b) => a.min - b.min);
  const pass = g.conversion.find((r) => r.value >= 2);
  if (pass && g.passAt === undefined) g.passAt = pass.min;
  return true;
}

// --- groups ---

function declareAndDescribe(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  const ms = mentions(f);
  let hit = false;
  for (const m of ms) {
    if (d.groups.has(m.key)) continue;
    const before = f.slice(Math.max(0, m.at - 40), m.at);
    const counted = new RegExp(`(?:^|[\\s(])${NUM}\\s+(?:[a-z-]+\\s+){0,2}$`).exec(before);
    const isOrdinal = /\d\.\s*$/.test(before);
    if (!counted && !DECLARE_VERB.test(f)) continue;
    if (isOrdinal) continue;
    const noun = NOUNS.find((n) => n.key === m.key)!;
    const g: Group = { key: m.key, kind: noun.kind, label: noun.label, idBase: noun.idBase, weight: 1, quote: s.text };
    if (m.key === "ropzh" && /dolgozat/.test(m.text)) g.label = "röpdolgozat";
    if (counted) g.count = num(counted[1]);
    if (m.key === "elmzh" && g.count === undefined) g.count = 1;
    d.groups.set(m.key, g);
    d.order.push(m.key);
    hit = true;
  }

  // Properties of the sentence's first group ("mindegyik 4 pontos", "duplán számít" …).
  const subject = ms.map((m) => d.groups.get(m.key)).find(Boolean);
  if (!subject) return hit;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`${NUM}\\s*pontos`).exec(f)) && subject.kind !== "assignment") {
    subject.max = num(m[1]);
    hit = true;
  }
  if ((m = new RegExp(`${NUM}\\s+(?:feleletvalasztos\\s+)?kerdes`).exec(f)) && subject.kind === "exam") {
    subject.max = num(m[1]);
    hit = true;
  }
  if (/1\s*-\s*5\s*(?:-ig)?\s*(?:skala|kozott)|jeggyel ertekel|osztalyzattal|erdemjeggyel/.test(f)) {
    subject.grade = true;
    hit = true;
  }
  if (/duplan szamit|ketszeres (?:sullyal|szorzoval)|ketszer szamit/.test(f)) {
    subject.weight = 2;
    hit = true;
  }
  if ((m = new RegExp(`legalabb\\s+${NUM}\\s*ponttal (?:teljesitheto|sikeres|ervenyes)|teljesitesehez legalabb\\s+${NUM}\\s*pont`).exec(f))) {
    subject.passAt = num(m[1] ?? m[2]);
    subject.passAtExplicit = true;
    hit = true;
  }
  if ((m = new RegExp(`${NUM}\\s*elmeleti\\s*(?:pont\\s*)?es\\s*${NUM}\\s*gyakorlati\\s*pont`).exec(f))) {
    subject.parts = [
      { id: "elm", label: "Elmélet", max: num(m[1])! },
      { id: "gyak", label: "Gyakorlat", max: num(m[2])! },
    ];
    hit = true;
  }
  if (/\+\s*\/\s*-|plusz\s*(?:\/|vagy|-)\s*minusz|pluszt? vagy minuszt?/.test(f) && subject.kind === "series") {
    subject.plusMinus = true;
    hit = true;
  }
  if (subject.key === "kviz") {
    subject.percent ??= {};
    if ((m = /legalabb\s+(\d+)\s*%/.exec(f))) {
      subject.percent.passAt = Number(m[1]);
      hit = true;
    }
    if ((m = new RegExp(`${NUM}\\s*(?:alkalommal|szor|szer)\\s*(?:probalhato|toltheto|kitoltheto)|${NUM}\\s*probalkozas`).exec(f))) {
      subject.percent.attempts = num(m[1] ?? m[2]);
      hit = true;
    }
  }
  return hit;
}

// --- assignments ---

function assignmentRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  const g = d.groups.get("beadando");
  if (!g || !/\bbeadando/.test(f)) return false;
  let hit = false;
  const m = new RegExp(`${NUM}\\s*pont(?:ot)?\\s*(?:er|jar|kap|szerezheto)`).exec(f);
  if (m) {
    if (/hatarido utan|javitas|kesve|kesett|ekkor|potlolag|ujrabead/.test(f)) g.late = num(m[1]);
    else g.onTime = num(m[1]);
    hit = true;
  }
  if (/(?:nincs|nem) elfogad|elutasit|nem fogad|nem teljesit/.test(f)) {
    d.gates.push({
      id: "bead",
      label: `Minden ${g.label} elfogadva`,
      test: () => `count(failed, ${groupIds(g).join(", ")}) == 0`,
      onFail: consequence(f),
      scope: "outcome",
      quote: s.text,
    });
    hit = true;
  }
  return hit;
}

// --- attendance ---

function attendanceRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/hianyz|jelenlet|tavollet|mulaszt/.test(f)) return false;
  const a = (d.attendance ??= { quote: s.text });
  let hit = false;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`${NUM}\\s*vagy\\s*tobb\\s*(?:\\w+\\s+)?(?:hianyzas|mulasztas|tavollet)`).exec(f))) {
    a.maxAbsences = num(m[1])! - 1;
    hit = true;
  } else if ((m = new RegExp(`${NUM}\\s*-?\\s*(?:nal|nel)\\s*tobb\\s*(?:\\w+\\s+)?(?:hianyzas|mulasztas)`).exec(f))) {
    a.maxAbsences = num(m[1]);
    hit = true;
  } else if (
    (m = new RegExp(`(?:legfeljebb|maximum|max\\.?|osszesen)\\s*${NUM}\\s*(?:\\w+\\s+)?(?:hianyzas|alkalom|mulasztas)|${NUM}\\s*(?:\\w+\\s+)?hianyzas\\w*\\s*(?:megengedett|engedelyezett|lehet)`).exec(f))
  ) {
    a.maxAbsences = num(m[1] ?? m[2]);
    hit = true;
  }
  if (hit) {
    a.quote = s.text;
    a.onExceed = consequence(f) ?? a.onExceed;
  }
  if (/igazolatlan (?:hianyzas|tavollet)\w* (?:\w+ )?minusz/.test(f)) {
    a.unexcusedMinus = true;
    hit = true;
  }
  if (/igazolt (?:es|vagy) (?:az )?igazolatlan|igazolt hianyzas\w* is|igazolassal is/.test(f)) {
    a.countExcused = true;
    hit = true;
  } else if (/csak (?:az )?igazolatlan|igazolt hianyzas\w* nem szamit/.test(f)) {
    a.countExcused = false;
    hit = true;
  }
  return hit;
}

function pmRule(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/minusz/.test(f) || !/plusz/.test(f)) return false;
  if (!/meghalad|tobb|nagyobb|nem haladhat|nem lehet tobb|legfeljebb annyi/.test(f)) return false;
  d.pmGate = { onFail: consequence(f), quote: s.text };
  return true;
}

// --- quizzes, bonus, series-level rules ---

function quizRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  const m = new RegExp(`${NUM}\\s*-?\\s*(?:nel|nal)\\s*kevesebb\\s*(?:\\w+\\s+)?(?:kviz|quiz)`).exec(f);
  if (!m) return false;
  const min = num(m[1])!;
  d.quizMin = { min, quote: s.text };
  const onTime = /hataridore|hataridoig|hatarido elott/.test(f);
  const q = d.groups.get("kviz");
  if (q) (q.percent ??= {}).onTimeOnly = onTime;
  const target = /elovizsga/.test(f) ? "elo" : /vizsgajegy|vizsga jegye/.test(f) ? "vizsga" : "main";
  if (/eggyel rosszabb|egy jeggyel (?:rosszabb|kevesebb|csokken|alacsonyabb)|-\s*1 jegy/.test(f)) {
    const label = `${min}-nél kevesebb kvíz${onTime ? " határidőre" : ""}`;
    d.modifiers.push({ target, when: () => "!kvizok", delta: -1, label, quote: s.text });
  }
  return true;
}

function bonusRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/bonusz/.test(f)) return false;
  let hit = false;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`${NUM}\\s*pont (?:feletti|folotti|folott|feletti resz)\\w*.*bonusz`).exec(f))) {
    d.surplusBonus = { over: num(m[1])!, quote: s.text };
    return true; // seriesRules reads the pass threshold of the same sentence
  }
  if (/osszpontszam|osszege/.test(f) && !/legfeljebb|maximum|max\./.test(f)) return false;
  const b = (d.bonus ??= { quote: s.text });
  if ((m = new RegExp(`(?:legfeljebb|maximum|max\\.?|maximalisan)\\s*${NUM}`).exec(f))) {
    b.cap = num(m[1]);
    hit = true;
  }
  if (/csak akkor szamit|nelkul is (?:teljesit|atmen|megfelel|sikeres)/.test(f)) {
    b.onlyIfPass = true;
    hit = true;
  }
  if (hit) b.quote = s.text;
  return hit || /bonuszpont\w* (?:szerezheto|kaphato|jar)/.test(f);
}

function seriesRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  const series = mentions(f).map((m) => d.groups.get(m.key)).find((g) => g?.kind === "series");
  if (!series) return false;
  let hit = false;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`akkor teljesitett,? ha\\s*(?:\\w+\\s+){0,3}legalabb\\s*${NUM}\\s*pont`).exec(f))) {
    d.seriesPass = { min: num(m[1])!, quote: s.text };
    hit = true;
  }
  if (/ha .*(?:nem teljesul|sikertelen|nem sikerul)/.test(f) && /eggyel rosszabb|egy jeggyel (?:rosszabb|kevesebb|csokken)/.test(f)) {
    const id = () => `${series.idBase}ok`;
    d.modifiers.push({ target: "main", when: () => `!${id()}`, delta: -1, label: `${capital(series.label)} nem teljesült`, quote: s.text });
    hit = true;
  }
  return hit;
}

// --- thresholds and gates ---

function thresholdRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/legalabb|>=|minimum/.test(f) || /megajanlott/.test(f)) return false;
  let hit = false;
  let m: RegExpExecArray | null;

  // Part totals of a series with parts.
  const partHits = [...f.matchAll(new RegExp(`(elmeleti|gyakorlati) pont\\w* osszeg\\w*\\s+(?:legalabb\\s+)?${NUM}`, "g"))];
  const withParts = d.order.map((k) => d.groups.get(k)!).find((g) => g.kind === "series" && g.parts);
  if (partHits.length > 0 && withParts) {
    const conds = partHits.map((p) => ({ part: p[1] === "elmeleti" ? "elm" : "gyak", min: num(p[2])! }));
    d.gates.push({
      id: `${withParts.idBase}_reszek`,
      label: `${capital(withParts.label)}: ${conds.map((c) => `${c.part === "elm" ? "elmélet" : "gyakorlat"} ≥ ${c.min}`).join(" és ")}`,
      test: () => conds.map((c) => `${withParts.idBase}.${c.part} >= ${c.min}`).join(" && "),
      onFail: consequence(f),
      scope: "outcome",
      quote: s.text,
    });
    return true;
  }

  // "A 2. zh (vagy pótzh-ja) eredményének legalább 20 pontnak kell lennie."
  if ((m = new RegExp(`(\\d)\\.\\s*(zh|nagyzh|nagy zh|zarthelyi)\\w*.*?legalabb\\s+${NUM}\\s*pont`).exec(f))) {
    const key: NounKey = m[2].startsWith("nagy") ? "nagyzh" : "zh";
    const g = d.groups.get(key);
    const i = Number(m[1]);
    const thr = num(m[3])!;
    if (g) {
      d.gates.push({
        id: `${g.idBase}${i}_min`,
        label: `${i}. ${g.label} (vagy pótja) ≥ ${thr}`,
        test: () => `${groupIds(g)[i - 1] ?? `${g.idBase}${i}`} >= ${thr}`,
        onFail: consequence(f),
        scope: "path",
        quote: s.text,
      });
      hit = true;
    }
  }

  // "A beszámított két zh összegének legalább 40 pontnak kell lennie."
  if (!hit && (m = new RegExp(`(?:zh|nagyzh)\\w*\\s+osszeg\\w*\\s+legalabb\\s+${NUM}`).exec(f))) {
    const key: NounKey = /nagy ?zh/.test(f) ? "nagyzh" : "zh";
    const g = d.groups.get(key);
    const thr = num(m[1])!;
    if (g) {
      d.gates.push({
        id: `${g.idBase}_ossz`,
        label: `A ${g.label}-k összege ≥ ${thr}`,
        test: () => `${groupIds(g).join(" + ")} >= ${thr}`,
        onFail: consequence(f),
        scope: "path",
        quote: s.text,
      });
      hit = true;
    }
  }

  // "Minden zh-nak legalább elégségesnek kell lennie."
  if (!hit && /\b(?:minden|mindegyik|mindket|mindharom|az osszes)\b/.test(f) && (/legalabb (?:elegseges|2)/.test(f) || /sikeres\w* kell/.test(f))) {
    const keys = mentions(f).map((x) => x.key);
    const groups =
      keys.includes("zh") && !d.groups.has("zh")
        ? mainExams(d)
        : keys.map((k) => d.groups.get(k)).filter((g): g is Group => g?.kind === "exam");
    if (groups.length > 0) {
      d.gates.push({
        id: "zhk",
        label: groups.length === 1 && groupIds(groups[0]).length > 1 ? `Minden ${groups[0].label} sikeres` : "Minden zh sikeres",
        test: () => `count(failed, ${groups.flatMap(groupIds).join(", ")}) == 0`,
        onFail: consequence(f),
        scope: "path",
        quote: s.text,
      });
      hit = true;
    }
  }
  return hit;
}

/** "Ha pontosan egy nagyzh sikertelen, a jegy ideiglenesen elégtelen …": consequence of a failed exam. */
function failureRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  const m = /\bha\b.*?(?:zh|nagyzh|nagy zh|zarthelyi)\w*\s+(?:sikertelen|nem sikerul|elegtelen|bukott)/.exec(f);
  if (!m) return false;
  const key: NounKey = /nagy ?zh/.test(m[0]) ? "nagyzh" : "zh";
  const g = d.groups.get(key);
  if (!g) return false;
  const after = f.slice(m.index + m[0].length);
  const c = consequence(after);
  if (/(?:ketto|ket|2)\s+vagy\s+tobb/.test(m[0])) return true; // uvRules handles it
  const gate = mustPassGate(d, g);
  if (c && gate.onFail === undefined) gate.onFail = c;
  if (/mindket|mindharom|mind a ket/.test(m[0]) && c) gate.onFail ??= c;
  return true;
}

export function mustPassGate(d: Draft, g: Group): GateDraft {
  const id = `${g.idBase}_mind`;
  let gate = d.gates.find((x) => x.id === id);
  if (!gate) {
    gate = {
      id,
      label: groupIds(g).length > 1 ? `Minden ${g.label} sikeres` : `${capital(g.label)} sikeres`,
      test: () => `count(failed, ${groupIds(g).join(", ")}) == 0`,
      scope: "path",
      quote: g.quote,
      group: g.key,
    };
    d.gates.push(gate);
  }
  return gate;
}

// --- retakes ---

function retakeRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  const nounMatch = f.match(RETAKE_NOUN);
  const verb = /javithato|potolhato|irhato|valtja ki|kivaltja|javithat|potolni|megirhato|lehet javitani|potolhato|irhat|szamit/.test(f);
  const groups = [...new Set(mentions(f).map((m) => m.key))].filter((k) => {
    const g = d.groups.get(k);
    return g?.kind === "exam" && !["gyakuv", "elo", "szobeli"].includes(k);
  });

  // A sentence about the mode only ("A javító zh csak akkor számít, ha jobb …") updates the last slot.
  if (nounMatch && groups.length === 0 && d.retakes.length > 0) {
    const mode = retakeMode(f);
    if (mode) {
      d.retakes.at(-1)!.mode = mode;
      return true;
    }
    return false;
  }
  if (!verb || groups.length === 0) return false;
  if (!nounMatch && !/javithato|potolhato/.test(f)) return false;
  if (/utovizsga|gyakuv/.test(f) && !nounMatch) return false;

  const noun = nounMatch?.[0] ?? "";
  const base = /^pot/.test(noun) ? "pot" : /^javito/.test(noun) ? "jav" : "";
  const label = /^pot/.test(noun) ? "Pótzh" : /^javito/.test(noun) ? "Javító zh" : "";
  const pick: RetakeDraft["pick"] = /rosszabba?t|rosszabbik|gyengebb/.test(f)
    ? "worse"
    : /abbol a temakorbol|a sikertelen|bukott|sikertelen\b/.test(f)
      ? "failed"
      : /kozul egy|valamelyik|egyik(?:et)?\b/.test(f)
        ? "choose"
        : undefined;
  const oneFailed = /ha (?:pontosan )?(?:egy|az egyik|csak egy)\b.*sikertelen/.test(f);

  const make = (keys: NounKey[], id: string, lbl: string) => {
    let unique = id;
    for (let i = 2; d.retakes.some((r) => r.id === unique); i++) unique = `${id}${i}`;
    d.retakes.push({
      id: unique,
      label: lbl,
      groups: keys,
      pick: pick ?? (keys.length === 1 && groupIds(d.groups.get(keys[0])!).length === 1 ? "choose" : undefined),
      mode: retakeMode(f),
      eligibleOneFailed: oneFailed || undefined,
      quote: s.text,
    });
  };
  if (base) make(groups, base, label);
  else for (const k of groups) make([k], `${d.groups.get(k)!.idBase}jav`, `${capital(d.groups.get(k)!.label)} javító`);
  return true;
}

function retakeMode(f: string): RetakeDraft["mode"] {
  if (/akkor is,? ha (?:\w+ ){0,4}rosszabb|rosszabb (?:eredmeny|esetben|eseten) is|ronthat|lefele is/.test(f)) return "replace";
  if (/csak (?:akkor szamit,? )?ha (?:\w+ ){0,3}jobb|csak javithat|csak (?:a )?jobb|nem ronthat/.test(f)) return "ifBetter";
  return undefined;
}

// --- formulas ---

const FORMULA_WORD = /[a-z_][a-z0-9_]*/g;

function formulaRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  let m: RegExpExecArray | null;
  // "F = a röpdolgozatokon szerzett összpontszám" (a letter naming a group total)
  if ((m = /^([a-z])\s*=\s*([^=]+)$/.exec(f)) && !/[+*/]/.test(m[2])) {
    const g = mentions(m[2]).map((x) => d.groups.get(x.key)).find(Boolean);
    if (g) {
      d.letters.set(m[1], g.key);
      return true;
    }
  }
  // "Ö = F/2 + Z1 + Z2"
  if ((m = /^([a-z]{1,3})\s*=\s*([a-z0-9_ ()+\-*/.,]+)$/.exec(f)) && /[+*/]/.test(m[2])) {
    const id = m[1];
    d.formulas.push({ id, label: `${s.text.split("=")[0].trim()} = ${s.text.split("=").slice(1).join("=").trim()}`, expr: m[2].replace(/,/g, "."), quote: s.text });
    return true;
  }
  // "A gyakorlati jegy: (zh1 + zh2 + bónusz) egész osztva 20-szal."
  if (/jegy/.test(f) && (m = /([a-z0-9_ ()+*]+?)\s*(?:egeszosztva|egesz osztva|egeszresze|osztva)\s*(\d+)\s*-?\s*(?:szal|zel|vel|al|el)?/.exec(f))) {
    const lhs = m[1].replace(/^.*?:\s*/, "").trim();
    if (/[a-z]/.test(lhs)) {
      d.gradeFormula = { expr: `floor((${lhs}) / ${m[2]})`, quote: s.text };
      return true;
    }
  }
  return false;
}

/** "… az összpontszám a nagyzh-k pontszámainak és a bónuszpontoknak az összege." */
function totalRule(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`osszesen\\s+${NUM}\\s*pont\\s*(?:szerezheto|erheto el|kaphato|a maximum)`).exec(f))) {
    d.totalStated = { value: num(m[1])!, quote: s.text };
    return true;
  }
  if ((m = /osszpontszam\w*\s+(?:a|az)\s+(.+?)\s+(?:az\s+)?osszege/.exec(f))) {
    const terms: string[] = [];
    for (const x of mentions(m[1])) terms.push(`@${x.key}`);
    if (/bonusz/.test(m[1])) terms.push("bonusz");
    if (terms.length > 0) {
      d.formulas.push({ id: "ossz", label: "Összpontszám", expr: terms.join(" + "), quote: s.text });
      return true;
    }
  }
  return false;
}

// --- re-exam, exam, offered grade ---

function uvRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  let hit = false;
  const g = d.groups.get("gyakuv");
  if (/(?:ketto|ket|2)\s+vagy\s+tobb\s+(?:\w+\s+)?(?:nagy ?zh|zh)\w*\s+(?:sikertelen|bukott|nem sikerul)/.test(f) && /gyakuv|utovizsga/.test(f)) {
    d.uv = { group: /nagy ?zh/.test(f) ? "nagyzh" : "zh", quote: s.text };
    if (!g) {
      d.groups.set("gyakuv", { key: "gyakuv", kind: "exam", label: "gyakorlati utóvizsga", idBase: "gyakuv", count: 1, weight: 1, quote: s.text });
      d.order.push("gyakuv");
    }
    hit = true;
  }
  const uv = d.groups.get("gyakuv");
  if (!uv || !/gyakuv|utovizsga/.test(f)) return hit;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`${NUM}\\s*temakor`).exec(f))) {
    const n = num(m[1])!;
    uv.parts = Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, label: `${i + 1}. témakör`, max: 0 }));
    hit = true;
  }
  if ((m = new RegExp(`temakor\\w*nkent\\s+legalabb\\s+${NUM}`).exec(f)) && uv.parts) {
    for (const p of uv.parts) p.passAt = num(m[1]);
    hit = true;
  }
  if ((m = new RegExp(`osszesen\\s+legalabb\\s+${NUM}`).exec(f))) {
    uv.passAt = num(m[1]);
    uv.passAtExplicit = true;
    hit = true;
  }
  if ((m = new RegExp(`legfeljebb\\s+${GRADE}\\s*(?:\\w+\\s+)?(?:szerezheto|erheto|kaphato)`).exec(f))) {
    uv.cap = gradeAt(m, 1);
    hit = true;
  }
  if (uv.max && uv.parts) for (const p of uv.parts) p.max = uv.max / uv.parts.length;
  return hit;
}

function examRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/\bvizsga\b|vizsgajegy/.test(f) || /megajanlott/.test(f)) return false;
  const hasElo = /elovizsga/.test(f);
  const hasOral = /szobeli/.test(f);
  if (!hasElo && !hasOral) return false;
  for (const key of ["elo", "szobeli"] as const) {
    if ((key === "elo" ? hasElo : hasOral) && !d.groups.has(key)) {
      const noun = NOUNS.find((n) => n.key === key)!;
      d.groups.set(key, { key, kind: "exam", label: noun.label, idBase: noun.idBase, count: 1, grade: true, weight: 1, quote: s.text });
      d.order.push(key);
    }
  }
  const m = new RegExp(`elovizsga\\w*,?\\s*(?:\\w+\\s+){0,3}legfeljebb\\s+${GRADE}`).exec(f);
  if (m) d.groups.get("elo")!.cap = gradeAt(m, 1);
  d.exam = { select: hasElo && hasOral && /\bvagy\b/.test(f) ? "best" : "first", quote: s.text };
  return true;
}

function megajRules(d: Draft, s: Sentence): boolean {
  const f = s.fold;
  if (!/megajanlott/.test(f)) return false;
  const conds: { label: string; test: () => string }[] = [];
  let m: RegExpExecArray | null;
  const series = d.order.map((k) => d.groups.get(k)!).find((g) => g.kind === "series" && g.parts);
  if (series && (m = new RegExp(`elmeleti\\s+resz\\w*\\s+(?:\\w+\\s+){0,2}legalabb\\s+${NUM}`).exec(f))) {
    const min = num(m[1])!;
    conds.push({ label: `${capital(series.label)} elmélet ≥ ${min}`, test: () => `${series.idBase}.elm >= ${min}` });
  }
  const zh = d.groups.get("zh") ?? mainExams(d)[0];
  if (zh && (m = new RegExp(`tetelpont\\w*\\s+(?:\\w+\\s+){0,2}legalabb\\s+${NUM}\\s*pont\\w*\\s*(?:\\(a\\s+${NUM}\\s*-?(?:bol|bol)\\))?.*?(?:-?nkent|kulon-kulon)\\s+legalabb\\s+${NUM}`).exec(f))) {
    const total = num(m[1])!;
    const of = num(m[2]);
    const each = num(m[3])!;
    const ids = () => groupIds(zh);
    const n = zh.count ?? 1;
    if (of !== undefined && zh.max !== undefined) {
      const per = of / n;
      zh.parts = [
        { id: "tetel", label: "Tétel", max: per },
        { id: "feladat", label: "Feladatok", max: zh.max - per },
      ];
      zh.partsAssumed = `Tételpontok: ${zh.label}-nként ${per} pont feltételezve (${of}-ból).`;
    }
    conds.push({
      label: `Tételpontok ≥ ${total} (${zh.label}-nként ≥ ${each})`,
      test: () => [...ids().map((id) => `${id}.tetel >= ${each}`), `${ids().map((id) => `${id}.tetel`).join(" + ")} >= ${total}`].join(" && "),
    });
  }
  if (conds.length === 0) return false;
  d.megaj = { conditions: [...(d.megaj?.conditions ?? []), ...conds], quote: s.text };
  return true;
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { FORMULA_WORD };
