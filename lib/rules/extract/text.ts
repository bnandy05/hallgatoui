// Text preparation for the rule extraction: normalise what a PDF copy-paste produces, split it into
// sentences (keeping table rows as their own lines) and read Hungarian numerals and grade words.
// Pure; every pattern in lexicon.ts runs on `Sentence.fold` (lower case, no accents).

export interface Sentence {
  index: number;
  text: string; // as written (whitespace collapsed), shown as the quote
  fold: string; // lower case, accents stripped, dashes and ≥ unified
}

export const MAX_EXTRACT_CHARS = 60_000;

/** Unify what PDFs and word processors vary: dashes, quotes, ≥/≤, non-breaking spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/…/g, "...")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2") // words hyphenated across lines
    .replace(/[ ]+/g, " ");
}

/** Lower case, accents stripped, whitespace collapsed; punctuation kept for the patterns. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lines, then sentences within a line. A line ending without a full stop is not joined with the
 * next one, because in pasted requirements that is a heading, a list item or a table row.
 */
export function segment(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const rawLine of normalizeText(text).slice(0, MAX_EXTRACT_CHARS).split("\n")) {
    const line = rawLine.replace(/^\s*(?:[-*•▪◦·]|\d+\)|[a-z]\))\s+/u, "").trim();
    if (!line) continue;
    // A sentence ends at . ! ? followed by a capital letter (so "2. zh" and "max. 8" stay whole).
    for (const part of line.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ])/u)) {
      const t = part.trim();
      if (t) out.push({ index: out.length, text: t, fold: fold(t) });
    }
  }
  return out;
}

const WORD_NUMBERS: Record<string, number> = {
  egy: 1,
  egyik: 1,
  ket: 2,
  ketto: 2,
  mindket: 2,
  harom: 3,
  mindharom: 3,
  negy: 4,
  ot: 5,
  hat: 6,
  het: 7,
  nyolc: 8,
  kilenc: 9,
  tiz: 10,
  tizenegy: 11,
  tizenketto: 12,
  tizenket: 12,
  tizenharom: 13,
  tizennegy: 14,
};

/** Regex source for a number written in digits or as a Hungarian word (folded text). */
export const NUM = "(\\d+(?:[.,]\\d+)?|tizenegy|tizenketto|tizenket|tizenharom|tizennegy|ketto|ket|harom|negy|nyolc|kilenc|tiz|egy|ot|hat|het)";

export function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const w = WORD_NUMBERS[s];
  if (w !== undefined) return w;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Hungarian grade words (folded) → 1..5. */
export const GRADE_WORDS: Record<string, number> = {
  elegtelen: 1,
  elegseges: 2,
  kozepes: 3,
  jo: 4,
  jeles: 5,
};

/** Regex source for a grade word, optionally followed by "(n)", or a bare "(n)". */
export const GRADE = "(?:(elegtelen|elegseges|kozepes|jo|jeles)\\b\\s*(?:\\(\\s*([1-5])\\s*\\))?|\\(\\s*([1-5])\\s*\\)|\\b([1-5])-?(?:es|as|os)\\b)";

/** The grade from the groups of a GRADE match starting at `i`. */
export function gradeAt(m: RegExpExecArray | RegExpMatchArray, i: number): number | undefined {
  if (m[i + 1]) return Number(m[i + 1]);
  if (m[i]) return GRADE_WORDS[m[i]];
  if (m[i + 2]) return Number(m[i + 2]);
  if (m[i + 3]) return Number(m[i + 3]);
  return undefined;
}
