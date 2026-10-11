import { getMessages, type Locale } from "@/lib/i18n";
import {
  LIGHT,
  DISPLAY,
  SHADOW_SHEET,
  documentHtml,
  escapeHtml,
  footer,
  mix,
  primaryButton,
  type RenderedEmail,
} from "@/lib/digestEmail";

// The account mails (confirm, sign-in link, reset, already registered, email change), drawn like
// the digest on the notice board: one paper sheet with one button. Pure.

export type AuthEmailKind = "confirm" | "magic" | "reset" | "already-registered" | "email-change";

const COPY_KEY = {
  confirm: "confirm",
  magic: "magic",
  reset: "reset",
  "already-registered": "alreadyRegistered",
  "email-change": "emailChange",
} as const;

export function renderAuthEmail(kind: AuthEmailKind, link: string, locale: Locale = "hu"): RenderedEmail {
  const t = getMessages(locale);
  const { subject, intro, button, ignore } = t.email.auth[COPY_KEY[kind]];
  const body = `<tr><td style="padding:6px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper" style="width:100%;background:${LIGHT.paper};border:1px solid ${mix(LIGHT.edge, LIGHT.paper, 0.5)};border-radius:2px;box-shadow:${SHADOW_SHEET}">
<tr><td style="padding:26px 26px 28px">
<h1 class="heading h1" style="margin:0 0 14px;${DISPLAY};font-size:34px;color:${LIGHT.heading}">${escapeHtml(subject)}</h1>
<p class="ink" style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${LIGHT.ink}">${escapeHtml(intro)}</p>
${primaryButton(link, button)}
<p class="muted" style="margin:22px 0 0;font-size:13px;line-height:1.55;color:${LIGHT.muted}">${escapeHtml(t.email.buttonFallback)}<br><a href="${escapeHtml(link)}" class="muted" style="color:${LIGHT.muted};word-break:break-all">${escapeHtml(link)}</a></p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 28px"></td></tr>
${footer([escapeHtml(ignore), t.email.independent])}`;

  const text = [subject, "", intro, "", `${button}: ${link}`, "", ignore].join("\n");
  return { subject, html: documentHtml(subject, intro, body, locale), text };
}
