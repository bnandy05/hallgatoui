import { addDays, addWeeks, endOfDay } from "date-fns";

/** How a new deadline repeats. "once" is the plain single deadline. */
export type RepeatSpec =
  | { kind: "once" }
  | { kind: "dates"; extra: Date[] } // besides the main due
  | {
      kind: "every";
      interval: number;
      unit: "day" | "week";
      end: { count: number } | { until: Date };
    };

export const MAX_SERIES = 30;
export const MAX_INTERVAL = 52;

const MINUTE = 60_000;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * The due dates of a new deadline, sorted, de-duplicated by minute, capped at MAX_SERIES, with
 * `first` always included. Daily and weekly steps are taken on local dates (date-fns), so the
 * wall-clock time is kept across a DST change; the zone is the runtime's (the user's browser).
 * `until` is inclusive: the whole day counts.
 */
export function expandDueDates(first: Date, spec: RepeatSpec): Date[] {
  let raw: Date[];
  if (spec.kind === "once") {
    raw = [first];
  } else if (spec.kind === "dates") {
    raw = [first, ...spec.extra];
  } else {
    const interval = clamp(spec.interval, 1, MAX_INTERVAL);
    const step = spec.unit === "day" ? addDays : addWeeks;
    const count = "count" in spec.end ? clamp(spec.end.count, 1, MAX_SERIES) : MAX_SERIES;
    const limit = "until" in spec.end ? endOfDay(spec.end.until).getTime() : Infinity;
    raw = [];
    // Step from the first date each time (not cumulatively) so month-end style drift cannot build up.
    for (let i = 0; i < count; i++) {
      const d = step(first, i * interval);
      if (d.getTime() > limit) break;
      raw.push(d);
    }
  }
  const seen = new Set<number>();
  const out: Date[] = [];
  for (const d of [...raw].sort((a, b) => a.getTime() - b.getTime())) {
    if (Number.isNaN(d.getTime())) continue;
    const key = Math.floor(d.getTime() / MINUTE);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.slice(0, MAX_SERIES);
}

/** True when the spec asked for more dates than MAX_SERIES allows. */
export function wasCapped(first: Date, spec: RepeatSpec): boolean {
  if (spec.kind === "dates") return 1 + spec.extra.length > MAX_SERIES;
  if (spec.kind === "every" && "until" in spec.end) {
    const interval = clamp(spec.interval, 1, MAX_INTERVAL);
    const step = spec.unit === "day" ? addDays : addWeeks;
    return step(first, MAX_SERIES * interval).getTime() <= endOfDay(spec.end.until).getTime();
  }
  return false;
}

/** "Kvíz" -> "Kvíz 1".."Kvíz n"; "Kvíz 3" -> "Kvíz 3".."Kvíz n+2". n = 1 keeps the title. */
export function seriesTitles(title: string, n: number): string[] {
  const t = title.trim();
  if (n <= 1) return [t];
  const m = /^(.*?)\s*(\d+)$/.exec(t);
  const base = m && m[1] ? m[1] : m ? "" : t;
  const start = m ? Number(m[2]) : 1;
  return Array.from({ length: n }, (_, i) => `${base ? `${base} ` : ""}${start + i}`);
}
