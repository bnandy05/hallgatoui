import type { Course, Deadline, IcalFeed } from "@/lib/types";
import { applyDedupe } from "@/lib/ical/dedupe";
import { isCritical, isRecentlyChanged } from "@/lib/radar";
import {
  budapestDate,
  budapestParts,
  dateKey,
  dayAbbreviation,
  mondayOf,
  type YMD,
} from "@/lib/ical/budapest";

// Pure content of the email digest (heti / havi). Server-side scheduling and sending
// live in lib/server/digest.ts; this file is free of I/O so it can be tested.

export type DigestFrequency = "heti" | "havi";

export const DIGEST_FREQUENCIES: { id: DigestFrequency; label: string }[] = [
  { id: "heti", label: "Heti (hétfő)" },
  { id: "havi", label: "Havi (1-jén)" },
];

/** What the browser sees about its own digest. */
export interface DigestStatus {
  email: string;
  frequency: DigestFrequency;
  confirmed: boolean;
  lastSentAt?: string;
}

export function isDigestFrequency(value: unknown): value is DigestFrequency {
  return value === "heti" || value === "havi";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERDUE_LOOKBACK_MS = 14 * DAY_MS;
/** How far ahead each digest looks. */
const HORIZON_DAYS: Record<DigestFrequency, number> = { heti: 7, havi: 31 };
const MONTHS = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

/**
 * The Budapest period an instant falls in: one digest is sent per period. A weekly digest's
 * period starts on Monday, a monthly one's on the 1st.
 */
export function digestPeriodKey(frequency: DigestFrequency, now: Date): string {
  const today = budapestDate(now);
  if (frequency === "heti") return `w:${dateKey(mondayOf(today))}`;
  return `m:${dateKey(today).slice(0, 6)}`;
}

/** Light shape check; the confirmation email is the real test. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email) ? email : null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDay(date: YMD): string {
  return `${MONTHS[date[1] - 1]} ${date[2]}. (${dayAbbreviation(date)})`;
}

/** "okt. 5. (H) 23:59" in Budapest time. */
export function formatDigestDue(instant: Date): string {
  const { date, hour, minute } = budapestParts(instant);
  return `${formatDay(date)} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface DigestItem {
  deadline: Deadline;
  course?: Course;
  critical: boolean;
  changed: boolean;
}

export interface DigestContent {
  overdue: DigestItem[];
  upcoming: DigestItem[];
  /** Names of feeds that have been failing for more than a day. */
  failingFeeds: string[];
  horizonDays: number;
}

export interface DigestInput {
  frequency: DigestFrequency;
  courses: Course[];
  deadlines: Deadline[];
  feeds: IcalFeed[];
  ignoredDuplicatePairs: string[];
  dedupe: boolean;
  failingFeeds?: string[];
  now: Date;
}

/** Selects what the digest lists: open overdue (last 14 days) and open upcoming deadlines. */
export function collectDigest(input: DigestInput): DigestContent {
  const { now, courses } = input;
  const nowMs = now.getTime();
  const horizonDays = HORIZON_DAYS[input.frequency];
  const horizonMs = nowMs + horizonDays * DAY_MS;
  const { visible } = applyDedupe(input.deadlines, input.feeds, input.ignoredDuplicatePairs, input.dedupe, courses);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const overdue: DigestItem[] = [];
  const upcoming: DigestItem[] = [];
  const open = visible
    .filter((d) => !d.done && !Number.isNaN(new Date(d.due).getTime()))
    .sort((a, b) => a.due.localeCompare(b.due));
  for (const d of open) {
    const dueMs = new Date(d.due).getTime();
    const item: DigestItem = {
      deadline: d,
      course: d.courseId ? courseById.get(d.courseId) : undefined,
      critical: d.critical || isCritical(d, now),
      changed: isRecentlyChanged(d, now),
    };
    if (dueMs < nowMs) {
      if (nowMs - dueMs <= OVERDUE_LOOKBACK_MS) overdue.push(item);
    } else if (dueMs <= horizonMs) {
      upcoming.push(item);
    }
  }
  return { overdue, upcoming, failingFeeds: input.failingFeeds ?? [], horizonDays };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const TITLES: Record<DigestFrequency, string> = {
  heti: "Heti összefoglaló",
  havi: "Havi összefoglaló",
};

function horizonLabel(frequency: DigestFrequency): string {
  if (frequency === "heti") return "A következő 7 nap";
  return "A következő 31 nap";
}

function safeUrl(url: string | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function courseLabel(course: Course | undefined): string {
  if (!course) return "";
  return course.code ? `${course.name} (${course.code})` : course.name;
}

function itemText(item: DigestItem): string {
  const d = item.deadline;
  const flags = [item.critical ? "kritikus" : "", item.changed ? "módosult" : ""].filter(Boolean);
  const course = courseLabel(item.course);
  return [
    `- ${formatDigestDue(new Date(d.due))}  ${d.title}`,
    course ? ` · ${course}` : "",
    flags.length ? ` [${flags.join(", ")}]` : "",
    item.changed && d.previousDue ? ` (korábban: ${formatDigestDue(new Date(d.previousDue))})` : "",
  ].join("");
}

// Inline styles only: email clients drop <style> blocks and can't read CSS variables, so the
// light tokens of app/tokens.css are copied here (ink, muted, danger, panel, bg, border, salmon).
const INK = "#1b1c1e";
const MUTED = "#45484c";
const RED = "#b3261e";
const PAPER = "#fdfdfa";
const FELT = "#dde2e4";
const LINE = "#c2c8cb";
const SALMON = "#f8cfc2";
// Webfonts are unreliable in mail clients: Archivo where installed, then system sans.
const FONT = "Archivo,Arial,Helvetica,sans-serif";

function itemHtml(item: DigestItem): string {
  const d = item.deadline;
  const url = safeUrl(d.url);
  const title = url
    ? `<a href="${escapeHtml(url)}" style="color:${INK};text-decoration:underline">${escapeHtml(d.title)}</a>`
    : escapeHtml(d.title);
  const color = item.course && /^#[0-9a-f]{3,8}$/i.test(item.course.color) ? item.course.color : MUTED;
  const flags = [
    item.critical ? `<span style="color:${RED};font-weight:700">kritikus</span>` : "",
    item.changed
      ? `<span style="color:${RED};font-weight:700">módosult</span>` +
        (d.previousDue ? ` <span style="color:${MUTED}">(korábban ${escapeHtml(formatDigestDue(new Date(d.previousDue)))})</span>` : "")
      : "",
  ].filter(Boolean);
  const course = courseLabel(item.course);
  return `<tr>
<td style="padding:10px 12px 10px 0;border-top:1px solid ${LINE};white-space:nowrap;vertical-align:top;font-size:13px;color:${MUTED}">${escapeHtml(formatDigestDue(new Date(d.due)))}</td>
<td style="padding:10px 0;border-top:1px solid ${LINE};vertical-align:top;font-size:15px;color:${INK}">
<div style="font-weight:600">${title}</div>
${course ? `<div style="font-size:13px;color:${MUTED};margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${color};margin-right:6px"></span>${escapeHtml(course)}</div>` : ""}
${flags.length ? `<div style="font-size:12.5px;margin-top:2px">${flags.join(" · ")}</div>` : ""}
</td>
</tr>`;
}

function sectionHtml(heading: string, items: DigestItem[]): string {
  if (items.length === 0) return "";
  return `<h2 style="margin:24px 0 6px;font-size:17px;color:${INK}">${escapeHtml(heading)} (${items.length})</h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${items.map(itemHtml).join("")}</table>`;
}

export interface RenderDigestInput {
  frequency: DigestFrequency;
  content: DigestContent;
  now: Date;
  appUrl: string;
  unsubscribeUrl: string;
}

export function renderDigestEmail({ frequency, content, now, appUrl, unsubscribeUrl }: RenderDigestInput): RenderedEmail {
  const today = formatDay(budapestDate(now));
  const title = TITLES[frequency];
  const criticalCount = content.upcoming.filter((i) => i.critical).length;
  const summaryParts = [
    content.upcoming.length === 0
      ? `${horizonLabel(frequency)}: nincs nyitott határidő.`
      : `${horizonLabel(frequency)}: ${content.upcoming.length} határidő` +
        (criticalCount > 0 ? `, ebből ${criticalCount} kritikus.` : "."),
    content.overdue.length > 0 ? `${content.overdue.length} lejárt, még nincs kipipálva.` : "",
  ].filter(Boolean);
  const subject =
    content.upcoming.length + content.overdue.length === 0
      ? `${title}: nincs nyitott határidő`
      : `${title}: ${content.upcoming.length} közelgő` +
        (content.overdue.length > 0 ? `, ${content.overdue.length} lejárt` : "") +
        " határidő";

  const warnings = content.failingFeeds.map(
    (name) => `A(z) „${name}” naptár több mint egy napja nem frissíthető. Ellenőrizd a linkjét a Beállításokban.`
  );

  const text = [
    `${title} · ${today}`,
    "",
    ...summaryParts,
    ...(warnings.length ? ["", ...warnings] : []),
    ...(content.overdue.length ? ["", "Lejárt", ...content.overdue.map(itemText)] : []),
    ...(content.upcoming.length ? ["", horizonLabel(frequency), ...content.upcoming.map(itemText)] : []),
    "",
    `Megnyitás: ${appUrl}`,
    `Leiratkozás: ${unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${FELT};font-family:${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${FELT}"><tr><td style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:${PAPER};border:1px solid ${LINE}"><tr><td style="padding:24px">
<div style="font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em">Hallgatói réteg · ${escapeHtml(today)}</div>
<h1 style="margin:6px 0 10px;font-size:24px;color:${INK}">${escapeHtml(title)}</h1>
${summaryParts.map((p) => `<p style="margin:0 0 4px;font-size:15px;color:${INK}">${escapeHtml(p)}</p>`).join("")}
${warnings.map((w) => `<p style="margin:12px 0 0;padding:10px 12px;background:${SALMON};font-size:14px;color:${INK}">${escapeHtml(w)}</p>`).join("")}
${sectionHtml("Lejárt", content.overdue)}
${sectionHtml(horizonLabel(frequency), content.upcoming)}
<p style="margin:28px 0 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:10px 16px;background:${INK};color:${PAPER};text-decoration:none;font-weight:700;font-size:14px">Megnyitás</a></p>
</td></tr></table>
<p style="max-width:600px;margin:14px auto 0;font-size:12px;color:${MUTED};text-align:center">
Ezt a levelet azért kapod, mert feliratkoztál a Hallgatói réteg összefoglalójára.
<a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED}">Leiratkozás</a>
</p>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

export function renderConfirmEmail({ frequency, confirmUrl }: { frequency: DigestFrequency; confirmUrl: string }): RenderedEmail {
  const label = DIGEST_FREQUENCIES.find((f) => f.id === frequency)?.label.toLowerCase() ?? frequency;
  const subject = "Erősítsd meg a feliratkozást";
  const text = [
    `Valaki (remélhetőleg te) ${label} e-mailes összefoglalót kért a Hallgatói réteg határidőiről erre a címre.`,
    "",
    `Megerősítés: ${confirmUrl}`,
    "",
    "Ha nem te kérted, hagyd figyelmen kívül ezt a levelet: megerősítés nélkül nem küldünk többet.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:${FELT};font-family:${FONT}">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;background:${PAPER};border:1px solid ${LINE}"><tr><td style="padding:24px;color:${INK};font-size:15px">
<h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(subject)}</h1>
<p style="margin:0 0 16px">Valaki (remélhetőleg te) ${escapeHtml(label)} e-mailes összefoglalót kért a Hallgatói réteg határidőiről erre a címre.</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:10px 16px;background:${INK};color:${PAPER};text-decoration:none;font-weight:700">Feliratkozás megerősítése</a></p>
<p style="margin:0;font-size:13px;color:${MUTED}">Ha nem te kérted, hagyd figyelmen kívül ezt a levelet: megerősítés nélkül nem küldünk többet.</p>
</td></tr></table>
</body></html>`;
  return { subject, html, text };
}
