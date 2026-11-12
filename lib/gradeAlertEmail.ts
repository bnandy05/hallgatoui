import type { DigestGrade } from "@/lib/digest";
import { DISPLAY, GRADES_SHOWN, LIGHT, SHADOW_PAPER, documentHtml, escapeHtml, footer, gradeRows, gradeRowsText, mix, primaryButton, type RenderedEmail } from "@/lib/digestEmail";
import { getMessages, type Locale } from "@/lib/i18n";

// The urgent grade-alert mail ("Jegy-figyelmeztetés: …"), drawn like the digest: heading on felt,
// one paper sheet with the alerts as ruled rows (danger carries the red stamp, opportunities sit
// on canary), the same inlined light tokens and dark overrides. Pure, so it can be tested.

export interface RenderGradeAlertInput {
  /** The alerts to tell about, most urgent first. */
  alerts: DigestGrade[];
  appUrl: string;
  /** Turns only the grade alerts off (`/hirlevel?m=riaszto…`). */
  unsubscribeUrl: string;
  /** Language of the mail; Hungarian when omitted. */
  locale?: Locale;
}

export function renderGradeAlertEmail({ alerts, appUrl, unsubscribeUrl, locale = "hu" }: RenderGradeAlertInput): RenderedEmail {
  const x = getMessages(locale).email;
  const intro = x.alert.intro(alerts.length);
  const subject = x.alert.subject(alerts.length, alerts[0]?.text ?? "");
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" class="dim" style="color:${LIGHT.mutedDim};text-decoration:underline">${escapeHtml(label)}</a>`;

  const body = `<tr><td style="padding:0 2px 22px">
<h1 class="heading h1" style="margin:0;${DISPLAY};font-size:44px;color:${LIGHT.heading}">${escapeHtml(x.alert.title)}</h1>
<p class="muted" style="margin:10px 0 0;font-size:15px;line-height:1.55;color:${LIGHT.muted}">${escapeHtml(intro)}</p>
</td></tr>
<tr><td style="padding:0 0 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper" style="width:100%;background:${LIGHT.paper};border:1px solid ${mix(LIGHT.edge, LIGHT.paper, 0.6)};border-radius:2px;box-shadow:${SHADOW_PAPER}">
<tr><td style="padding:6px 16px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${gradeRows(x, alerts, appUrl)}</table>${
  alerts.length > GRADES_SHOWN ? `<p class="muted" style="margin:6px 0 0;font-size:13px;color:${LIGHT.muted}">${escapeHtml(x.grades.more(alerts.length - GRADES_SHOWN))}</p>` : ""
}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 0 30px">
${primaryButton(`${appUrl}/`, x.alert.open)}
</td></tr>
${footer([
  escapeHtml(x.alert.reason),
  `${link(unsubscribeUrl, x.alert.unsubscribe)} · ${link(`${appUrl}/beallitasok#jegyriaszto`, x.alert.settings)}`,
  escapeHtml(x.independent),
])}`;

  const text = [
    x.alert.title,
    "",
    intro,
    "",
    ...gradeRowsText(x, alerts),
    "",
    `${x.grades.openText}: ${appUrl}/`,
    `${x.alert.unsubscribeText}: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject, html: documentHtml(x.alert.title, intro, body, locale), text };
}
