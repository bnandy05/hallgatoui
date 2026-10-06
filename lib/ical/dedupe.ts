import type { Course, Deadline, IcalFeed } from "@/lib/types";
import { budapestDate, budapestParts, dateKey } from "@/lib/ical/budapest";
import { normalizeSearch } from "@/lib/text";

// Duplicate detection: the same deadline reaching us from several sources (Canvas, Neptun,
// a manual entry...). Pure and computed on demand, groups are never stored. Only the user's
// "not a duplicate" exceptions (ignoredDuplicatePairs) are persisted.

export interface DuplicateGroup {
  primary: Deadline;
  others: Deadline[];
}

const SAME_TIME_WINDOW_MS = 60 * 60 * 1000;
const OVERLAP_THRESHOLD = 0.6;

/** Lower number = preferred as the primary copy. */
const SOURCE_PRIORITY: Record<string, number> = { manual: 0, canvas: 1, moodle: 2, neptun: 3 };
const OTHER_PRIORITY = 4;

/** Matched after normalizeSearch, so accent-free. */
const BOILERPLATE = new Set([
  "beadando",
  "assignment",
  "hazi",
  "feladat",
  "hw",
  "homework",
  "zh",
  "zarthelyi",
  "vizsga",
  "exam",
  "quiz",
  "kviz",
  "teszt",
  "test",
]);

/** "manual" or the platform id of the deadline's feed (canvas, moodle, neptun, custom...). */
export function deadlineSourceKey(d: Deadline, feeds: IcalFeed[]): string {
  if (d.source === "manual") return "manual";
  const feed = d.feedId ? feeds.find((f) => f.id === d.feedId) : undefined;
  return feed?.platformId ?? d.platformId ?? "egyeb";
}

/**
 * Stable identity. Ids of feed deadlines are random on the server, so those are identified
 * by feed + source UID instead.
 */
export function deadlineIdentity(d: Deadline): string {
  if (d.source === "ical") {
    return d.feedId && d.externalUid ? `ical:${d.feedId}:${d.externalUid}` : `ical-id:${d.id}`;
  }
  return `manual:${d.id}`;
}

/** Order-independent key of two deadlines. */
export function pairKey(a: Deadline, b: Deadline): string {
  return [deadlineIdentity(a), deadlineIdentity(b)].sort().join("|");
}

interface PreparedTitle {
  full: string;
  /** Tokens of `full` in order (numbers without leading zeros). */
  seq: string[];
  tokens: Set<string>;
  numbers: Set<string>;
}

const stripZeros = (digits: string) => digits.replace(/^0+(?=\d)/, "");
const tokenize = (text: string) => text.split(/[^a-z0-9]+/).filter(Boolean);

function prepareTitle(title: string, course: Course | undefined): PreparedTitle {
  const full = normalizeSearch(title)
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const numbers = new Set((full.match(/\d+/g) ?? []).map(stripZeros));

  const drop = new Set(BOILERPLATE);
  let text = full;
  if (course) {
    for (const word of tokenize(normalizeSearch(course.name))) drop.add(word);
    for (const code of (course.code ?? "").split(/[,;]/)) {
      const normalized = normalizeSearch(code);
      if (normalized) text = text.split(normalized).join(" ");
    }
  }
  const tokens = new Set(
    tokenize(text)
      .map((t) => (/^\d+$/.test(t) ? stripZeros(t) : t))
      .filter((t) => !drop.has(t))
  );
  const seq = tokenize(full).map((t) => (/^\d+$/.test(t) ? stripZeros(t) : t));
  return { full, seq, tokens, numbers };
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/**
 * Whole-token containment: `small`'s tokens appear as a contiguous run in `big`. "zh" is in
 * "diszkret matematika i zh" but not in "ropzh 01". The small side must be at least 2 tokens or
 * 3 characters, or a single boilerplate word like "zh" (otherwise a bare "ZH" could never merge).
 */
function containsAsTokens(big: PreparedTitle, small: PreparedTitle): boolean {
  const n = small.seq.length;
  if (n === 0 || n > big.seq.length) return false;
  const meaningful = n >= 2 || small.full.length >= 3 || BOILERPLATE.has(small.seq[0]);
  if (!meaningful) return false;
  for (let start = 0; start + n <= big.seq.length; start++) {
    if (small.seq.every((t, k) => big.seq[start + k] === t)) return true;
  }
  return false;
}

function titlesSimilar(a: PreparedTitle, b: PreparedTitle): boolean {
  // "Beadandó 02" is not "Beadandó 03".
  if (a.numbers.size > 0 && b.numbers.size > 0 && !sameSet(a.numbers, b.numbers)) return false;
  if (containsAsTokens(a, b) || containsAsTokens(b, a)) return true;
  if (a.tokens.size === 0 || b.tokens.size === 0) return a.full === b.full;
  let shared = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) shared += 1;
  return shared / Math.min(a.tokens.size, b.tokens.size) >= OVERLAP_THRESHOLD;
}

function isAllDay(due: Date): boolean {
  const { hour, minute } = budapestParts(due);
  return hour === 23 && minute === 59;
}

function sameFeedOrBothManual(a: Deadline, b: Deadline): boolean {
  if (a.source === "manual" && b.source === "manual") return true;
  return a.source === "ical" && b.source === "ical" && !!a.feedId && a.feedId === b.feedId;
}

function priorityOf(d: Deadline, feeds: IcalFeed[]): number {
  return SOURCE_PRIORITY[deadlineSourceKey(d, feeds)] ?? OTHER_PRIORITY;
}

/** Finds groups of deadlines that are the same item seen through different sources. */
export function findDuplicates(
  deadlines: Deadline[],
  feeds: IcalFeed[],
  ignoredPairs: string[],
  courses: Course[]
): DuplicateGroup[] {
  const ignored = new Set(ignoredPairs);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Candidates share a course and a Budapest day, so bucket by that first.
  const buckets = new Map<string, number[]>();
  const dueMs: number[] = [];
  deadlines.forEach((d, i) => {
    const ms = new Date(d.due).getTime();
    dueMs.push(ms);
    if (!d.courseId || Number.isNaN(ms)) return;
    const key = `${d.courseId}|${dateKey(budapestDate(new Date(ms)))}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  });

  const parent = deadlines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const prepared = new Map<number, PreparedTitle>();
  const titleOf = (i: number) => {
    let p = prepared.get(i);
    if (!p) {
      p = prepareTitle(deadlines[i].title, courseById.get(deadlines[i].courseId ?? ""));
      prepared.set(i, p);
    }
    return p;
  };

  for (const bucket of buckets.values()) {
    for (let x = 0; x < bucket.length; x++) {
      for (let y = x + 1; y < bucket.length; y++) {
        const i = bucket[x];
        const j = bucket[y];
        const a = deadlines[i];
        const b = deadlines[j];
        if (sameFeedOrBothManual(a, b)) continue;
        if (
          !isAllDay(new Date(dueMs[i])) &&
          !isAllDay(new Date(dueMs[j])) &&
          Math.abs(dueMs[i] - dueMs[j]) > SAME_TIME_WINDOW_MS
        ) {
          continue;
        }
        if (ignored.has(pairKey(a, b))) continue;
        if (!titlesSimilar(titleOf(i), titleOf(j))) continue;
        parent[find(i)] = find(j);
      }
    }
  }

  const members = new Map<number, Deadline[]>();
  deadlines.forEach((d, i) => {
    const root = find(i);
    const list = members.get(root);
    if (list) list.push(d);
    else members.set(root, [d]);
  });

  const rank = (d: Deadline) => ({
    priority: priorityOf(d, feeds),
    due: new Date(d.due).getTime(),
    identity: deadlineIdentity(d),
  });
  const compare = (a: Deadline, b: Deadline) => {
    const ra = rank(a);
    const rb = rank(b);
    return (
      ra.priority - rb.priority ||
      ra.due - rb.due ||
      (ra.identity < rb.identity ? -1 : ra.identity > rb.identity ? 1 : 0)
    );
  };

  const groups: DuplicateGroup[] = [];
  for (const list of members.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(compare);
    groups.push({ primary: sorted[0], others: sorted.slice(1) });
  }
  return groups;
}

export interface DedupeResult {
  visible: Deadline[];
  /** Primary deadline id -> its other copies. */
  extras: Map<string, Deadline[]>;
}

/**
 * Hides the non-primary copies. With `enabled` false everything stays visible. The primary's
 * done/critical flags stand for the whole group.
 */
export function applyDedupe(
  deadlines: Deadline[],
  feeds: IcalFeed[],
  ignoredPairs: string[],
  enabled: boolean,
  courses: Course[]
): DedupeResult {
  if (!enabled) return { visible: deadlines, extras: new Map() };
  const groups = findDuplicates(deadlines, feeds, ignoredPairs, courses);
  if (groups.length === 0) return { visible: deadlines, extras: new Map() };
  const hidden = new Set(groups.flatMap((g) => g.others.map((d) => d.id)));
  return {
    visible: deadlines.filter((d) => !hidden.has(d.id)),
    extras: new Map(groups.map((g) => [g.primary.id, g.others])),
  };
}
