// Pure Europe/Budapest calendar helpers. The server runs in UTC while users are in Budapest,
// so every calendar date or week used in exports is computed here, never in the runtime's
// local time zone.

export type YMD = [number, number, number];

const TIME_ZONE = "Europe/Budapest";
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_ABBREVIATIONS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"]; // Monday first

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface BudapestParts {
  date: YMD;
  hour: number;
  minute: number;
}

/** Wall-clock date and time of an instant in Budapest. */
export function budapestParts(instant: Date): BudapestParts {
  const parts: Record<string, number> = {};
  for (const p of partsFormat.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { date: [parts.year, parts.month, parts.day], hour: parts.hour % 24, minute: parts.minute };
}

/**
 * The UTC instant of a Budapest wall-clock time (handles CET/CEST). Guesses the instant as if
 * Budapest were UTC, reads back what Budapest shows for it and corrects by the difference;
 * a second pass settles the guess when the offset changed between the two instants.
 */
export function budapestInstant([y, m, d]: YMD, hour: number, minute: number): Date {
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const shown = budapestParts(new Date(guess));
    const shownMs = Date.UTC(shown.date[0], shown.date[1] - 1, shown.date[2], shown.hour, shown.minute);
    guess += wanted - shownMs;
  }
  return new Date(guess);
}

/** The calendar date of an instant in Budapest. */
export function budapestDate(instant: Date): YMD {
  return budapestParts(instant).date;
}

/** Adds (or subtracts) whole days to a calendar date. */
export function addDays([y, m, d]: YMD, days: number): YMD {
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/** Weekday of a calendar date, 1 = Monday ... 7 = Sunday. */
export function isoWeekday([y, m, d]: YMD): number {
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Monday of the week that contains the calendar date. */
export function mondayOf(date: YMD): YMD {
  return addDays(date, 1 - isoWeekday(date));
}

/** "20261005", sortable and usable in UIDs. */
export function dateKey([y, m, d]: YMD): string {
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** Day abbreviation of a Budapest date: H K Sze Cs P Szo V. */
export function dayAbbreviation(date: YMD): string {
  return DAY_ABBREVIATIONS[isoWeekday(date) - 1];
}

/** "HH:mm" of an instant in Budapest. */
export function budapestTime(instant: Date): string {
  const { hour, minute } = budapestParts(instant);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "2026. 10. 05. 23:59" in Budapest time. */
export function formatBudapest(instant: Date): string {
  const [y, m, d] = budapestDate(instant);
  return `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")}. ${budapestTime(instant)}`;
}
