// The guided reading, for documents the pattern parser does not recognise: a fixed questionnaire
// (which kinds of components there are, how many, their points and minimums, the grade limits)
// whose options come from the text itself, so Jev (or the student) only ever picks one of the
// document's own numbers. Each question carries just the sentences that mention its topic.
// Pure: answers in, rules and the remaining questions out. Assumptions become "Ellenőrizd" flags.

import type { Derived, Gate, RuleComponent, RuleFlag, SubjectRules } from "../types";
import type { Answers, Question, QuestionOption } from "./assemble";
import type { Sentence } from "./text";

export interface Guided {
  rules: SubjectRules | null;
  questions: Question[];
  errors: string[];
  sources: { label: string; quote: string }[];
}

interface Kind {
  key: "zh" | "beadando" | "kviz" | "vizsga";
  label: string; // Hungarian, singular
  english: string;
  words: RegExp; // on Sentence.fold
}

const KINDS: Kind[] = [
  { key: "zh", label: "zárthelyi dolgozat (zh)", english: "written test (zh, zárthelyi, midterm)", words: /\b(zh|zarthelyi|dolgozat|midterm|nagyzh)/ },
  { key: "beadando", label: "beadandó feladat", english: "assignment or project to submit (beadandó, házi feladat)", words: /\b(beadando|hazi|projekt|assignment|homework)/ },
  { key: "kviz", label: "kvíz vagy röpzh", english: "short quiz or small test (kvíz, röpzh, röpdolgozat)", words: /\b(kviz|quiz|ropzh|ropdolgozat|teszt)/ },
  { key: "vizsga", label: "vizsga", english: "final exam (vizsga)", words: /\b(vizsga|exam)/ },
];

const SHAPE_WORDS = /\b(pont|jegy|atlag|osszes|elegseges|kozepes|jeles|ertekel|szamit)/;
const LIMIT_WORDS = /\b(elegseges|kozepes|jo|jeles|ponttol|%|szazalek|hatar)/;
const ABSENCE_WORDS = /\b(hianyz|hianyoz|jelenlet|katalogus|absen)/;
const MAX_QUOTE = 1500;
/** The quote Jev gets when no sentence mentions the topic (the review screen hides it). */
export const NO_MENTION = "(The document does not mention this.)";
const MAX_NUMBERS = 80;

const YES_NO: QuestionOption[] = [
  { id: "yes", label: "Igen", criterion: "yes, the course has this" },
  { id: "no", label: "Nem", criterion: "no, the course does not have this" },
];
const NONE: QuestionOption = { id: "none", label: "Nincs ilyen", criterion: "the text states no such number" };

/** The sentences that mention a topic, in document order, as one quote. */
function about(sentences: Sentence[], words: RegExp, max = 5): Sentence[] {
  return sentences.filter((s) => words.test(s.fold)).slice(0, max);
}
const quoteOf = (ss: Sentence[]) => ss.map((s) => s.text).join(" ").slice(0, MAX_QUOTE);

/** The document's numbers (no years), as choice options. */
function numberOptions(sentences: Sentence[], cap = Infinity): QuestionOption[] {
  const seen = new Set<number>();
  for (const s of sentences) {
    for (const m of s.text.matchAll(/(?<![\d.,])\d{1,4}(?:[.,]\d+)?(?![\d])/g)) {
      const v = Number(m[0].replace(",", "."));
      if (Number.isFinite(v) && v <= 1000 && v <= cap && !(v >= 1900 && v <= 2100)) seen.add(v);
    }
  }
  return [...seen]
    .sort((a, b) => a - b)
    .slice(0, MAX_NUMBERS)
    .map((v) => ({ id: `n${v}`, label: String(v).replace(".", ","), criterion: String(v) }));
}
const numberOf = (id: string | undefined) => (id && /^n\d/.test(id) ? Number(id.slice(1)) : undefined);

const COUNT_OPTIONS: QuestionOption[] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14].map((n) => ({
  id: `n${n}`,
  label: String(n),
  criterion: String(n),
}));

class Asker {
  questions: Question[] = [];
  answers: Answers;
  constructor(answers: Answers) {
    this.answers = answers;
  }
  /** Records the question; returns the answer, or the first option provisionally. */
  ask(id: string, prompt: string, instructions: string, quote: string, options: QuestionOption[]): string {
    this.questions.push({ id, prompt, instructions, quote: quote || NO_MENTION, options });
    const a = this.answers[id];
    return options.some((o) => o.id === a) ? a : options[0].id;
  }
}

export function readGuided(sentences: Sentence[], answers: Answers): Guided {
  const ask = new Asker(answers);
  const errors: string[] = [];
  const sources: Guided["sources"] = [];
  const flags: RuleFlag[] = [
    {
      field: "guided",
      message: "A szöveget nem ismertük fel pontosan, ezért kérdésekkel olvastuk ki. Vesd össze minden számot a dokumentummal.",
      resolved: false,
    },
  ];

  const shapeQuote = quoteOf(about(sentences, SHAPE_WORDS, 6));
  const shape = ask.ask(
    "g:shape",
    "Hogyan jön ki a jegy?",
    "How is the course grade computed?",
    shapeQuote,
    [
      { id: "points", label: "Összpontszámból, ponthatárok szerint", criterion: "points of the components are added up and a points (or percentage) table gives the grade" },
      { id: "average", label: "Az összetevők jegyeinek átlagából", criterion: "each component gets a 1-5 grade and the course grade is their average" },
    ]
  );
  sources.push({ label: "Jegy", quote: shapeQuote });

  const components: RuleComponent[] = [];
  const gates: Gate[] = [];
  const terms: { expr: string; max: number }[] = [];

  for (const kind of KINDS) {
    const mentions = about(sentences, kind.words);
    if (mentions.length === 0) continue;
    if (kind.key === "kviz" && shape === "average") {
      flags.push({ field: "kviz", message: "A kvízeket az átlagos jegyszámításba nem vettük fel; ha számítanak, add hozzá kézzel.", resolved: false });
      continue;
    }
    const quote = quoteOf(mentions);
    sources.push({ label: kind.label, quote });
    const present = ask.ask(`g:${kind.key}:present`, `Van a tárgyban ${kind.label}?`, `Does the course's grading include a ${kind.english}?`, quote, YES_NO);
    if (present !== "yes") continue;
    const count =
      kind.key === "vizsga"
        ? 1
        : numberOf(
            ask.ask(`g:${kind.key}:count`, `Hány ${kind.label} van?`, `How many of the ${kind.english} are there in the semester?`, quote, COUNT_OPTIONS)
          )!;
    const numbers = numberOptions(mentions);

    if (shape === "points") {
      if (numbers.length === 0) {
        errors.push(`A(z) ${kind.label} pontszámát nem találtuk a szövegben.`);
        continue;
      }
      const max = numberOf(
        ask.ask(`g:${kind.key}:max`, `Hány pontos egy ${kind.label}?`, `What is the maximum score of one ${kind.english}?`, quote, numbers)
      )!;
      const minId = ask.ask(
        `g:${kind.key}:min`,
        `${capital(kind.label)}: legalább hány pont kell darabonként?`,
        `What minimum score does each ${kind.english} need to count as passed? Choose 'none' if no minimum is stated.`,
        quote,
        [NONE, ...numbers.filter((o) => numberOf(o.id)! <= max)]
      );
      const min = numberOf(minId);
      const ids = addItems(components, kind, count, { kind: "points", max, ...(min !== undefined && { passAt: min }) });
      for (const id of ids) {
        // A series counts as one term: the sum of its items.
        terms.push({ expr: id, max: kind.key === "kviz" ? max * count : max });
        if (min !== undefined && kind.key !== "kviz") gates.push({ id: `min_${id}`, label: `${labelOf(components, id)}: legalább ${min} pont`, test: `${id} >= ${min}`, onFail: "fail" });
      }
    } else {
      const pass = ask.ask(
        `g:${kind.key}:pass`,
        `Minden ${kind.label}-nak legalább elégségesnek kell lennie?`,
        `Must every ${kind.english} be at least a passing grade (2) on its own?`,
        quote,
        YES_NO
      );
      const ids = addItems(components, kind, count, null);
      for (const id of ids) {
        terms.push({ expr: id, max: 5 });
        if (pass === "yes") gates.push({ id: `min_${id}`, label: `${labelOf(components, id)}: legalább elégséges`, test: `${id} >= 2`, onFail: "fail" });
      }
    }
  }

  const absences = about(sentences, ABSENCE_WORDS);
  if (absences.length) {
    const quote = quoteOf(absences);
    sources.push({ label: "Hiányzás", quote });
    const limit = numberOf(
      ask.ask("g:absence", "Legfeljebb hány hiányzás megengedett?", "How many absences are allowed at most? Choose 'none' if the text sets no limit.", quote, [NONE, ...numberOptions(absences, 30)])
    );
    if (limit !== undefined) {
      components.unshift({ id: "jelen", label: "Jelenlét", kind: "attendance", limit: { maxAbsences: limit, countExcused: true, onExceed: "none" } });
      flags.push({ field: "jelen", message: "Feltételeztük, hogy az igazolt hiányzás is beszámít, és túllépés esetén nincs jegy.", resolved: false });
    }
  }

  if (terms.length === 0) {
    return { rules: null, questions: ask.questions, errors: [...errors, "Nem találtunk pontozott vagy jeggyel értékelt összetevőt a szövegben."], sources };
  }

  const derived: Derived[] = [];
  let grade: string;
  const tables: SubjectRules["tables"] = [];
  if (shape === "points") {
    const total = terms.reduce((s, t) => s + t.max, 0);
    derived.push({ id: "ossz", label: `Összpontszám (max ${total})`, expr: terms.map((t) => t.expr).join(" + ") });
    const limitQuote = quoteOf(about(sentences, LIMIT_WORDS, 8));
    sources.push({ label: "Ponthatárok", quote: limitQuote });
    const percent =
      /%|szazalek/.test(limitQuote.toLowerCase()) &&
      ask.ask("g:unit", "A ponthatárok százalékban vannak megadva?", "Are the grade limits given as percentages of the maximum (rather than points)?", limitQuote, YES_NO) === "yes";
    const limitOptions = numberOptions(about(sentences, LIMIT_WORDS, 8), percent ? 100 : Infinity);
    if (limitOptions.length === 0) {
      errors.push("A ponthatárokat nem találtuk a szövegben.");
    } else {
      const rows = [{ min: 0, value: 1 }];
      const names = ["", "", "elégséges (2)", "közepes (3)", "jó (4)", "jeles (5)"];
      for (const g of [2, 3, 4, 5]) {
        const v = numberOf(
          ask.ask(`g:t${g}`, `Mettől ${names[g]}?`, `From how many ${percent ? "percent" : "points"} does the student get grade ${g}?`, limitQuote, limitOptions)
        )!;
        rows.push({ min: percent ? Math.round((v / 100) * total * 100) / 100 : v, value: g });
      }
      tables.push({ id: "jegy", rows });
    }
    grade = "table(jegy, ossz)";
  } else {
    derived.push({ id: "atlag", label: "Az összetevők átlaga", expr: `(${terms.map((t) => t.expr).join(" + ")}) / ${terms.length}` });
    grade = "floor(atlag + 0.5)";
    flags.push({ field: "atlag", message: "Az átlagot egyenlő súllyal, a szokásos kerekítéssel számoltuk.", resolved: false });
  }

  return {
    rules: {
      schemaVersion: 1,
      components,
      retakes: [],
      derived,
      tables,
      outcomes: [
        {
          id: "gyak",
          label: "Gyakorlati jegy",
          kind: "gyakorlat",
          select: "first",
          ...(gates.length > 0 && { gates }),
          paths: [{ id: "alap", label: shape === "points" ? "Pontszám alapján" : "Átlag alapján", grade }],
        },
      ],
      flags,
    },
    questions: ask.questions,
    errors,
    sources: sources.filter((s) => s.quote),
  };
}

function addItems(
  components: RuleComponent[],
  kind: Kind,
  count: number,
  points: { kind: "points"; max: number; passAt?: number } | null
): string[] {
  const name: Record<Kind["key"], string> = { zh: "zh", beadando: "beadandó", kviz: "kvíz", vizsga: "Vizsga" };
  if (kind.key === "kviz") {
    components.push({
      id: "kviz",
      label: count > 1 ? "Kvízek" : "Kvíz",
      kind: "series",
      item: "quiz",
      count,
      scoring: { kind: "points", max: points?.max ?? 1 },
    });
    return ["kviz"];
  }
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = count > 1 ? `${kind.key}${i}` : kind.key;
    const label = kind.key === "vizsga" ? "Vizsga" : count > 1 ? `${i}. ${name[kind.key]}` : name[kind.key].charAt(0).toUpperCase() + name[kind.key].slice(1);
    components.push({ id, label, kind: "exam", scale: points ?? { kind: "grade" } });
    ids.push(id);
  }
  return ids;
}

function labelOf(components: RuleComponent[], id: string): string {
  return components.find((c) => c.id === id)?.label ?? id;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
