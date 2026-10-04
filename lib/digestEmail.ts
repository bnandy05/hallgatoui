import type { Course } from "@/lib/types";
import {
  addDays,
  budapestDate,
  budapestTime,
  dateKey,
  isoWeekday,
  mondayOf,
  type YMD,
} from "@/lib/ical/budapest";
import { type DigestContent, type DigestFrequency, type DigestItem } from "@/lib/digest";

// The digest and confirmation mails, drawn as the notice board: the heading on felt, then the
// days as felt strips with paper slips pinned to them (DESIGN.md). Pure, so it can be tested.
//
// Mail clients can't read CSS variables and many drop <style>, so the light tokens of
// app/tokens.css are copied here and inlined. The <style> block only adds what capable clients
// (Apple Mail, iOS) understand: Archivo, the after-hours colours and a narrower day column.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const LIGHT = {
  felt: "#dde2e4",
  feltDark: "#c9cfd2",
  strip: "#e9ecee",
  paper: "#fdfdfa",
  heading: "#111214",
  ink: "#1b1c1e",
  muted: "#45484c",
  mutedDim: "#585c61",
  edge: "#c2c8cb",
  edgeStrong: "#9aa2a7",
  accentInk: "#fdfdfa",
  danger: "#b3261e",
  warning: "#94470a",
  pin: "#d8352a",
  pinNeutral: "#9aa2a7",
  canary: "#f7e27e",
  canarySoft: "#f1e6ab",
  salmon: "#f8cfc2",
};

const DARK = {
  felt: "#171b1e",
  strip: "#1f2427",
  paper: "#282d31",
  heading: "#f2f2ed",
  ink: "#e4e5e0",
  muted: "#b2b7ba",
  mutedDim: "#9ba1a6",
  edge: "#3c4348",
  accent: "#e8e8e2",
  accentInk: "#15181a",
  danger: "#f2776b",
  warning: "#e9a862",
  canary: "#4a4018",
  canarySoft: "#322f1e",
  salmon: "#4b2a25",
};

const FONT = "Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif";
const DISPLAY_FONT = "Archivo,'Arial Narrow','Helvetica Neue',Helvetica,Arial,sans-serif";
/** The printed-notice voice: condensed heavy Archivo where the client loads it. */
const DISPLAY = `font-family:${DISPLAY_FONT};font-weight:800;font-stretch:72%;font-variation-settings:'wdth' 72;line-height:1.02;letter-spacing:-0.005em`;
const TABULAR = "font-variant-numeric:tabular-nums";
const SHADOW_PAPER = "0 1px 1px rgba(30,40,48,0.08),0 3px 8px -3px rgba(30,40,48,0.22)";
const SHADOW_SHEET = "0 1px 2px rgba(30,40,48,0.08),0 10px 24px -12px rgba(30,40,48,0.3)";

const MONTHS_SHORT = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
const MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
const MONTHS_IN = ["januárban", "februárban", "márciusban", "áprilisban", "májusban", "júniusban", "júliusban", "augusztusban", "szeptemberben", "októberben", "novemberben", "decemberben"];
const WEEKDAYS = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];
const WEEKDAYS_SHORT = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const shortDate = ([, m, d]: YMD) => `${MONTHS_SHORT[m - 1]} ${d}.`;
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** "okt. 5. (H) 23:59" in Budapest time. */
export function formatDigestDue(instant: Date): string {
  const date = budapestDate(instant);
  return `${shortDate(date)} (${WEEKDAYS_SHORT[isoWeekday(date) - 1]}) ${budapestTime(instant)}`;
}

/** "okt. 5–11." or "szept. 28. – okt. 4." */
function rangeLabel(from: YMD, to: YMD): string {
  if (from[1] === to[1]) return `${MONTHS_SHORT[from[1] - 1]} ${from[2]}–${to[2]}.`;
  return `${shortDate(from)} – ${shortDate(to)}`;
}

/** A colour at `amount` (0..1) over another, both #rrggbb: the app's color-mix, precomputed. */
function mix(color: string, over: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(color, i) * amount + channel(over, i) * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function courseColor(course: Course | undefined): string {
  const c = course?.color;
  if (c && /^#[0-9a-f]{6}$/i.test(c)) return c;
  if (c && /^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join("")}`;
  return LIGHT.pinNeutral;
}

function safeUrl(url: string | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function courseLabel(course: Course | undefined): string {
  if (!course) return "";
  return course.code ? `${course.name} · ${course.code}` : course.name;
}

/** The course line on a slip; the code never breaks across lines. */
function courseHtml(course: Course): string {
  const name = escapeHtml(course.name);
  return course.code ? `${name} · <span style="white-space:nowrap">${escapeHtml(course.code)}</span>` : name;
}

// --- shared pieces -------------------------------------------------------------------------

function documentHtml(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&amp;display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { text-underline-offset:2px; }
  ::selection { background:${LIGHT.canary}; }
  @media (max-width:480px) {
    .day-col { width:68px !important; padding-left:10px !important; padding-right:6px !important; }
    .day-name { font-size:16px !important; }
    .h1 { font-size:36px !important; }
    .outer { padding:20px 12px 28px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .felt, body { background:${DARK.felt} !important; }
    .strip { background:${DARK.strip} !important; }
    .today { background:${DARK.canarySoft} !important; }
    .paper { background:${DARK.paper} !important; border-color:${DARK.edge} !important; }
    .salmon { background:${DARK.salmon} !important; }
    .canary { background:${DARK.canary} !important; }
    .heading, .heading a { color:${DARK.heading} !important; }
    .rule { border-color:#0e1113 !important; }
    .ink, .ink a { color:${DARK.ink} !important; }
    .muted, .muted a { color:${DARK.muted} !important; }
    .dim, .dim a { color:${DARK.mutedDim} !important; }
    .danger { color:${DARK.danger} !important; }
    .stamp-danger { color:${DARK.danger} !important; border-color:${mix(DARK.danger, DARK.paper, 0.55)} !important; }
    .stamp-warning { color:${DARK.warning} !important; border-color:${mix(DARK.warning, DARK.paper, 0.55)} !important; }
    .btn { background:${DARK.accent} !important; border-color:${DARK.accent} !important; color:${DARK.accentInk} !important; }
    .dashed { border-color:${DARK.edge} !important; }
  }
</style>
</head>
<body class="felt" style="margin:0;padding:0;background:${LIGHT.felt}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="felt" style="width:100%;background:${LIGHT.felt}">
<tr><td align="center" class="outer" style="padding:28px 16px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${FONT};color:${LIGHT.ink}">
${wordmark()}
${body}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The wordmark from the app header: a red pushpin head beside the condensed name. */
function wordmark(): string {
  return `<tr><td style="padding:0 0 28px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="width:11px;padding-right:9px;vertical-align:middle"><div style="width:11px;height:11px;border-radius:6px;background:${LIGHT.pin};box-shadow:1px 2px 2px rgba(20,24,28,0.35)"></div></td>
<td class="heading" style="vertical-align:middle;${DISPLAY};font-size:19px;color:${LIGHT.heading}">Hallgatói réteg</td>
</tr></table>
</td></tr>`;
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="btn" style="background:${LIGHT.ink};border:1px solid ${LIGHT.ink};border-radius:4px;box-shadow:0 1px 2px rgba(20,24,28,0.25)">
<a href="${escapeHtml(href)}" class="btn" style="display:inline-block;padding:11px 18px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:${LIGHT.accentInk};text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function footer(lines: string[]): string {
  return `<tr><td class="dim rule" style="padding:28px 2px 0;border-top:1px solid ${LIGHT.feltDark};font-size:12.5px;line-height:1.55;color:${LIGHT.mutedDim}">
${lines.map((l) => `<p style="margin:0 0 4px">${l}</p>`).join("\n")}
</td></tr>`;
}

// --- digest --------------------------------------------------------------------------------

/** A rubber stamp, as `Badge`: outline at 55%, ink mixed 80% with black, no fill. */
function stamp(label: string, tone: "danger" | "warning", over: string): string {
  const color = LIGHT[tone];
  return `<span class="stamp-${tone}" style="display:inline-block;padding:0 5px;border:1px solid ${mix(color, over, 0.55)};border-radius:3px;font-size:11.5px;font-weight:600;line-height:17px;color:${mix(color, "#000000", 0.8)};white-space:nowrap">${escapeHtml(label)}</span>`;
}

/**
 * One deadline: a paper slip whose pin carries state (course colour while open, red when
 * overdue or critical), the title, the course, the due time and the stamps.
 */
function slip(item: DigestItem, overdue: boolean, showDate: boolean): string {
  const d = item.deadline;
  const due = new Date(d.due);
  const hot = overdue || item.critical;
  const pin = hot ? LIGHT.pin : courseColor(item.course);
  const url = safeUrl(d.url);
  const title = url
    ? `<a href="${escapeHtml(url)}" style="color:${LIGHT.heading};text-decoration:underline;text-decoration-color:${LIGHT.edgeStrong}">${escapeHtml(d.title)}</a>`
    : escapeHtml(d.title);
  const when = showDate ? formatDigestDue(due) : budapestTime(due);
  const stamps = [
    !overdue && item.critical ? stamp("Kritikus", "danger", LIGHT.paper) : "",
    item.changed ? stamp("Módosult", "warning", LIGHT.paper) : "",
  ].filter(Boolean);
  const previous =
    item.changed && d.previousDue
      ? `<span class="dim" style="color:${LIGHT.mutedDim}">korábban ${escapeHtml(formatDigestDue(new Date(d.previousDue)))}</span>`
      : "";
  const meta = [item.course ? `<span class="muted" style="color:${LIGHT.muted}">${courseHtml(item.course)}</span>` : "", ...stamps, previous]
    .filter(Boolean)
    .join(`<span style="display:inline-block;width:8px"></span>`);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper" style="width:100%;background:${LIGHT.paper};border:1px solid ${mix(LIGHT.edge, LIGHT.paper, 0.6)};border-radius:2px;box-shadow:${SHADOW_PAPER}">
<tr>
<td style="width:10px;padding:13px 0 0 12px;vertical-align:top"><div style="width:10px;height:10px;border-radius:5px;background:${pin};box-shadow:1px 2px 2px rgba(20,24,28,0.3)"></div></td>
<td style="padding:10px 12px 11px 10px;vertical-align:top">
<div class="heading" style="font-size:15px;font-weight:600;line-height:1.4;color:${LIGHT.heading}">${title}</div>
${meta ? `<div style="margin-top:4px;font-size:13px;line-height:1.5">${meta}</div>` : ""}
</td>
<td class="${hot ? "danger" : "ink"}" style="padding:11px 12px 0 0;vertical-align:top;text-align:right;white-space:nowrap;font-size:13.5px;font-weight:600;${TABULAR};color:${hot ? LIGHT.danger : LIGHT.ink}">${escapeHtml(when)}</td>
</tr>
</table>`;
}

function slipStack(items: DigestItem[], overdue: boolean, showDate: boolean): string {
  return items
    .map((item, i) => `<div style="${i > 0 ? "margin-top:8px" : ""}">${slip(item, overdue, showDate)}</div>`)
    .join("\n");
}

/** A day of the board: a lighter felt strip, Canary Soft for today, the day name beside its slips. */
function dayStrip(day: YMD, items: DigestItem[], today: YMD): string {
  const isToday = dateKey(day) === dateKey(today);
  const bg = isToday ? LIGHT.canarySoft : LIGHT.strip;
  return `<tr><td style="padding:0 0 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="${isToday ? "today" : "strip"}" style="width:100%;background:${bg};border-radius:2px">
<tr>
<td class="day-col" style="width:92px;padding:12px 8px 12px 14px;vertical-align:top">
<div class="heading day-name" style="${DISPLAY};font-size:19px;color:${LIGHT.heading}">${WEEKDAYS[isoWeekday(day) - 1]}</div>
<div class="muted" style="margin-top:3px;font-size:13px;${TABULAR};color:${LIGHT.muted}">${isToday ? "ma, " : ""}${shortDate(day)}</div>
</td>
<td style="padding:10px 10px 10px 0;vertical-align:top">
${slipStack(items, false, false)}
</td>
</tr>
</table>
</td></tr>`;
}

function groupByDay(items: DigestItem[]): { day: YMD; items: DigestItem[] }[] {
  const days = new Map<string, { day: YMD; items: DigestItem[] }>();
  for (const item of items) {
    const day = budapestDate(new Date(item.deadline.due));
    const key = dateKey(day);
    const group = days.get(key) ?? { day, items: [] };
    group.items.push(item);
    days.set(key, group);
  }
  return [...days.values()];
}

function weekHeading(monday: YMD, thisMonday: YMD, from: YMD, to: YMD): string {
  const diff = Math.round((Date.UTC(...ymdUtc(monday)) - Date.UTC(...ymdUtc(thisMonday))) / (7 * 86_400_000));
  const name = diff === 0 ? "Ez a hét" : diff === 1 ? "Jövő hét" : null;
  const start = dateKey(monday) < dateKey(from) ? from : monday;
  const sunday = addDays(monday, 6);
  const end = dateKey(sunday) > dateKey(to) ? to : sunday;
  return `<tr><td style="padding:18px 2px 10px">
<span class="heading" style="${DISPLAY};font-size:22px;color:${LIGHT.heading}">${name ?? rangeLabel(start, end)}</span>${
    name ? `<span class="muted" style="padding-left:10px;font-size:13.5px;${TABULAR};color:${LIGHT.muted}">${rangeLabel(start, end)}</span>` : ""
  }
</td></tr>`;
}

function ymdUtc([y, m, d]: YMD): [number, number, number] {
  return [y, m - 1, d];
}

function overdueBlock(items: DigestItem[]): string {
  return `<tr><td style="padding:0 0 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="salmon" style="width:100%;background:${LIGHT.salmon};border-radius:2px">
<tr><td style="padding:14px 14px 4px">
<span class="danger" style="${DISPLAY};font-size:19px;color:${LIGHT.danger}">Lejárt</span>
<span class="ink" style="padding-left:8px;font-size:13px;color:${LIGHT.ink}">még nincs kipipálva</span>
</td></tr>
<tr><td style="padding:8px 10px 10px">
${slipStack(items, true, true)}
</td></tr>
</table>
</td></tr>`;
}

function feedNotice(name: string): string {
  return `<tr><td style="padding:0 0 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="canary" style="width:100%;background:${LIGHT.canary};border-radius:2px">
<tr><td class="ink" style="padding:12px 14px;font-size:14px;line-height:1.5;color:${LIGHT.ink}">
<strong>A(z) „${escapeHtml(name)}” naptár nem frissül.</strong> Több mint egy napja nem sikerül letölteni, ezért a határidői elavultak lehetnek. Ellenőrizd a linkjét a Beállításokban.
</td></tr>
</table>
</td></tr>`;
}

export interface RenderDigestInput {
  frequency: DigestFrequency;
  content: DigestContent;
  now: Date;
  appUrl: string;
  unsubscribeUrl: string;
}

export function renderDigestEmail({ frequency, content, now, appUrl, unsubscribeUrl }: RenderDigestInput): RenderedEmail {
  const { overdue, upcoming, failingFeeds, from, to } = content;
  const today = budapestDate(now);
  const weekly = frequency === "heti";
  const title = weekly ? "Heti összefoglaló" : `Havi összefoglaló: ${MONTHS[from[1] - 1]}`;
  const periodName = weekly ? "a héten" : MONTHS_IN[from[1] - 1];
  const critical = upcoming.filter((i) => i.critical).length;

  const summary =
    upcoming.length === 0
      ? `Nincs nyitott határidő ${periodName}.`
      : `${upcoming.length} határidő ${periodName}` + (critical > 0 ? `, ebből ${critical} kritikus.` : ".");
  const overdueLine = overdue.length > 0 ? `${overdue.length} lejárt határidő még nincs kipipálva.` : "";

  const subject =
    upcoming.length === 0 && overdue.length === 0
      ? `${title}: nincs nyitott határidő`
      : `${title}: ${upcoming.length} határidő` +
        (critical > 0 ? `, ${critical} kritikus` : "") +
        (overdue.length > 0 ? `, ${overdue.length} lejárt` : "");

  // The board: days of the period, grouped into weeks for the monthly digest.
  const board: string[] = [];
  const thisMonday = mondayOf(today);
  let currentWeek = "";
  for (const { day, items } of groupByDay(upcoming)) {
    const monday = mondayOf(day);
    if (!weekly && dateKey(monday) !== currentWeek) {
      currentWeek = dateKey(monday);
      board.push(weekHeading(monday, thisMonday, from, to));
    }
    board.push(dayStrip(day, items, today));
  }
  if (upcoming.length === 0) {
    board.push(`<tr><td style="padding:0 0 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="dashed" style="width:100%;border:2px dashed ${LIGHT.edgeStrong};border-radius:2px">
<tr><td class="muted" style="padding:22px 18px;font-size:14.5px;line-height:1.5;color:${LIGHT.muted}">
<span class="heading" style="${DISPLAY};font-size:19px;color:${LIGHT.heading}">Nincs nyitott határidő ${escapeHtml(periodName)}</span><br>
Ha új határidő érkezik, a következő összefoglalóban már látod.
</td></tr>
</table>
</td></tr>`);
  }

  const body = `<tr><td style="padding:0 2px 22px">
<h1 class="heading h1" style="margin:0;${DISPLAY};font-size:44px;${TABULAR};color:${LIGHT.heading}">${escapeHtml(weekly ? rangeLabel(from, to) : capitalize(MONTHS[from[1] - 1]))}</h1>
<p class="muted" style="margin:10px 0 0;font-size:15px;line-height:1.55;color:${LIGHT.muted}">${weekly ? "Heti" : "Havi"} összefoglaló.${upcoming.length > 0 ? ` ${escapeHtml(summary)}` : ""}${overdueLine ? ` ${escapeHtml(overdueLine)}` : ""}</p>
</td></tr>
${failingFeeds.map(feedNotice).join("\n")}
${overdue.length > 0 ? overdueBlock(overdue) : ""}
${board.join("\n")}
<tr><td style="padding:22px 0 30px">
${primaryButton(`${appUrl}/radar`, "Határidők megnyitása")}
</td></tr>
${footer([
  `Ezt a levelet azért kapod, mert feliratkoztál a Hallgatói réteg ${weekly ? "heti" : "havi"} összefoglalójára.`,
  `<a href="${escapeHtml(unsubscribeUrl)}" class="dim" style="color:${LIGHT.mutedDim};text-decoration:underline">Leiratkozás</a> · <a href="${escapeHtml(`${appUrl}/beallitasok#ertesitesek`)}" class="dim" style="color:${LIGHT.mutedDim};text-decoration:underline">Beállítások</a>`,
  "Független projekt, nem kapcsolódik a Neptunhoz.",
])}`;

  const itemText = (item: DigestItem) => {
    const d = item.deadline;
    const flags = [item.critical ? "kritikus" : "", item.changed ? "módosult" : ""].filter(Boolean);
    const course = courseLabel(item.course);
    return [
      `- ${formatDigestDue(new Date(d.due))}  ${d.title}`,
      course ? ` (${course})` : "",
      flags.length ? ` [${flags.join(", ")}]` : "",
      item.changed && d.previousDue ? `, korábban: ${formatDigestDue(new Date(d.previousDue))}` : "",
    ].join("");
  };
  const text = [
    `${title} · ${rangeLabel(from, to)}`,
    "",
    summary,
    ...(overdueLine ? [overdueLine] : []),
    ...failingFeeds.map((name) => `\nA(z) „${name}” naptár több mint egy napja nem frissül. Ellenőrizd a linkjét a Beállításokban.`),
    ...(overdue.length ? ["", "Lejárt", ...overdue.map(itemText)] : []),
    ...(upcoming.length ? ["", weekly ? "A héten" : MONTHS[from[1] - 1], ...upcoming.map(itemText)] : []),
    "",
    `Határidők: ${appUrl}/radar`,
    `Leiratkozás: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject, html: documentHtml(title, `${summary}${overdueLine ? ` ${overdueLine}` : ""}`, body), text };
}

// --- confirmation --------------------------------------------------------------------------

export function renderConfirmEmail({ frequency, confirmUrl }: { frequency: DigestFrequency; confirmUrl: string }): RenderedEmail {
  const label = frequency === "heti" ? "heti" : "havi";
  const when = frequency === "heti" ? "minden hétfő reggel" : "minden hónap első reggelén";
  const subject = "Erősítsd meg a feliratkozást";
  const intro = `Ezzel a címmel ${label} összefoglalót kértek a Hallgatói réteg határidőiről. Ha te voltál, erősítsd meg, és ${when} megkapod a közelgő és lejárt határidőidet.`;
  const ignore = "Ha nem te kérted, nem kell semmit tenned: megerősítés nélkül több levelet nem küldünk. A link 48 óráig érvényes.";

  const body = `<tr><td style="padding:6px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper" style="width:100%;background:${LIGHT.paper};border:1px solid ${mix(LIGHT.edge, LIGHT.paper, 0.5)};border-radius:2px;box-shadow:${SHADOW_SHEET}">
<tr><td style="padding:26px 26px 28px">
<h1 class="heading h1" style="margin:0 0 14px;${DISPLAY};font-size:34px;color:${LIGHT.heading}">${escapeHtml(subject)}</h1>
<p class="ink" style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${LIGHT.ink}">${escapeHtml(intro)}</p>
${primaryButton(confirmUrl, "Feliratkozás megerősítése")}
<p class="muted" style="margin:22px 0 0;font-size:13px;line-height:1.55;color:${LIGHT.muted}">Ha a gomb nem működik, nyisd meg ezt a címet:<br><a href="${escapeHtml(confirmUrl)}" class="muted" style="color:${LIGHT.muted};word-break:break-all">${escapeHtml(confirmUrl)}</a></p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 28px"></td></tr>
${footer([escapeHtml(ignore), "Független projekt, nem kapcsolódik a Neptunhoz."])}`;

  const text = [subject, "", intro, "", `Megerősítés: ${confirmUrl}`, "", ignore].join("\n");
  return { subject, html: documentHtml(subject, intro, body), text };
}
