// The numbers of a document, found by code. Jev never writes a number: every point question is a
// choice among these candidates (plus "none"), so an answer is always copied from the document.
// Pure.

export interface Candidate {
  id: string; // "c0", "c1"… in document order
  text: string; // the literal, e.g. "40", "50%", "50–60%", "2,5"
  value: number; // the number; the lower bound of a range
  upper?: number; // the upper bound of a range
  percent: boolean;
  context: string; // about 70 characters around the first occurrence, whitespace collapsed
}

export const MAX_CANDIDATES = 150;
const MAX_VALUE = 1000;
const CONTEXT_CHARS = 70;

const NUM = String.raw`\d{1,3}(?:[.,]\d)?`;
const PCT = String.raw`(?:\s?%|\s?százalék\p{L}*)`;
// A number is never part of a longer digit run ("202" in "2026") or of a word ("zh1", "Z2"), and
// never the tail of a decimal ("2.5" is read whole).
const NUMBER_RE = new RegExp(
  String.raw`(?<![\p{L}\d])(?<!\d[.,])(${NUM})(${PCT})?(?:\s?[-–—]\s?(${NUM})(${PCT})?)?(?!\d)`,
  "gu"
);
// Dates are blanked out before scanning: "2026. 10. 07." and "2026.10.07", "2026-10-07".
const DATE_RE = /\d{4}\.\s?\d{1,2}\.\s?\d{1,2}\.?|\d{4}-\d{2}-\d{2}/g;

const parse = (s: string) => Number(s.replace(",", "."));
const normal = (text: string) => text.replace(/\s/g, "").replace(/[—-]/g, "–").replace(",", ".").toLowerCase();

export function numberCandidates(text: string): Candidate[] {
  const scan = text.replace(DATE_RE, (m) => " ".repeat(m.length));
  const seen = new Set<string>();
  const out: Candidate[] = [];

  const add = (literal: string, value: number, upper: number | undefined, percent: boolean, at: number, length: number) => {
    if (out.length >= MAX_CANDIDATES) return;
    if (!Number.isFinite(value) || value > MAX_VALUE || (upper !== undefined && upper > MAX_VALUE)) return;
    const key = normal(literal);
    if (seen.has(key)) return;
    seen.add(key);
    const from = Math.max(0, at - Math.floor((CONTEXT_CHARS - length) / 2));
    const context = text.slice(from, at + length + Math.ceil((CONTEXT_CHARS - length) / 2)).replace(/\s+/g, " ").trim();
    out.push({ id: `c${out.length}`, text: literal, value, ...(upper !== undefined && { upper }), percent, context });
  };

  for (const m of scan.matchAll(NUMBER_RE)) {
    const [whole, a, pa, b, pb] = m;
    const at = m.index!;
    const first = a + (pa ? "%" : "");
    if (b === undefined) {
      if (parse(a) >= 1900 && parse(a) <= 2100) continue;
      add(first, parse(a), undefined, !!pa, at, whole.length);
      continue;
    }
    const percent = !!(pa || pb);
    const second = b + (pb ? "%" : "");
    const lo = parse(a);
    const hi = parse(b);
    // The whole range, then its two ends (a percent sign belongs to both ends).
    add(`${first}–${second}`, lo, hi, percent, at, whole.length);
    add(a + (percent ? "%" : ""), lo, undefined, percent, at, whole.length);
    add(b + (percent ? "%" : ""), hi, undefined, percent, at, whole.length);
  }
  return out;
}

