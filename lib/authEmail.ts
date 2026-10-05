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

interface Copy {
  subject: string;
  intro: string;
  button: string;
  ignore: string;
}

const COPY: Record<AuthEmailKind, Copy> = {
  confirm: {
    subject: "Erősítsd meg az e-mail-címedet",
    intro: "Ezzel a címmel fiókot hoztak létre a Hallgatói rétegben. Erősítsd meg a címet, és már használhatod is.",
    button: "E-mail-cím megerősítése",
    ignore: "Ha nem te regisztráltál, nem kell semmit tenned. A link 48 óráig érvényes.",
  },
  magic: {
    subject: "Belépő link",
    intro: "Erre a linkre kattintva belépsz a Hallgatói rétegbe jelszó nélkül.",
    button: "Belépés",
    ignore: "Ha nem te kérted, nyugodtan hagyd figyelmen kívül. A link 30 percig érvényes, és egyszer használható.",
  },
  reset: {
    subject: "Új jelszó beállítása",
    intro: "Jelszó-emlékeztetőt kértek ehhez a fiókhoz. A linken új jelszót állíthatsz be, utána belépsz.",
    button: "Új jelszó megadása",
    ignore: "Ha nem te kérted, hagyd figyelmen kívül, a jelszavad nem változik. A link 30 percig érvényes, és egyszer használható.",
  },
  "already-registered": {
    subject: "Már van fiókod",
    intro: "Ezzel a címmel már van fiók a Hallgatói rétegben, ezért nem hoztunk létre újat. Az alábbi linkkel beléphetsz jelszó nélkül.",
    button: "Belépés",
    ignore: "Ha nem te próbáltál regisztrálni, hagyd figyelmen kívül, a fiókod és a jelszavad változatlan. A link 30 percig érvényes.",
  },
  "email-change": {
    subject: "Erősítsd meg az új e-mail-címedet",
    intro: "A Hallgatói réteg fiókodhoz ezt a címet szeretnéd használni. Erősítsd meg, és a fiókod, a naptár és az összefoglaló is erre a címre kapcsolódik.",
    button: "Új cím megerősítése",
    ignore: "Ha nem te kérted, hagyd figyelmen kívül, a fiókod címe nem változik. A link 48 óráig érvényes.",
  },
};

export function renderAuthEmail(kind: AuthEmailKind, link: string): RenderedEmail {
  const { subject, intro, button, ignore } = COPY[kind];
  const body = `<tr><td style="padding:6px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper" style="width:100%;background:${LIGHT.paper};border:1px solid ${mix(LIGHT.edge, LIGHT.paper, 0.5)};border-radius:2px;box-shadow:${SHADOW_SHEET}">
<tr><td style="padding:26px 26px 28px">
<h1 class="heading h1" style="margin:0 0 14px;${DISPLAY};font-size:34px;color:${LIGHT.heading}">${escapeHtml(subject)}</h1>
<p class="ink" style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${LIGHT.ink}">${escapeHtml(intro)}</p>
${primaryButton(link, button)}
<p class="muted" style="margin:22px 0 0;font-size:13px;line-height:1.55;color:${LIGHT.muted}">Ha a gomb nem működik, nyisd meg ezt a címet:<br><a href="${escapeHtml(link)}" class="muted" style="color:${LIGHT.muted};word-break:break-all">${escapeHtml(link)}</a></p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 28px"></td></tr>
${footer([escapeHtml(ignore), "Független projekt, nem kapcsolódik a Neptunhoz."])}`;

  const text = [subject, "", intro, "", `${button}: ${link}`, "", ignore].join("\n");
  return { subject, html: documentHtml(subject, intro, body), text };
}
