import type { Locale } from "@/lib/i18n/locales";
import { CONTROLLER, HOSTING, MINIMUM_AGE, SOURCE_URL, TERMS_UPDATED } from "@/lib/legal";

// The text of the terms of use and service-provider details (/feltetelek) in both languages.
// Pure, so it can be tested. The Hungarian text is the authoritative one; the English page says
// so. Change it together with the service it describes and bump TERMS_UPDATED in lib/legal.ts.

/** A paragraph: plain text, or text around one inline link. */
export type TermsParagraph =
  | string
  | { before: string; link: { kind: "privacy" | "source" | "mail"; text: string }; after: string };

export interface TermsRow {
  label: string;
  value: string;
  /** How the value is rendered: plain text, mailto link or external link. */
  kind?: "mail" | "url";
}

export interface TermsSection {
  title: string;
  paragraphs: TermsParagraph[];
  /** The accuracy and liability section stands out. */
  prominent?: boolean;
}

export interface TermsContent {
  title: string;
  sub: string;
  /** English page only: points at the authoritative Hungarian text. */
  translationNote?: string;
  provider: { title: string; operator: TermsRow[]; note: string; hostingTitle: string; hosting: TermsRow[] };
  sections: TermsSection[];
}

const HU: TermsContent = {
  title: "Felhasználási feltételek",
  sub: `Hatályos: ${TERMS_UPDATED}. A szolgáltató adatai és a Hallgatói réteg használatának szabályai.`,
  provider: {
    title: "1. Szolgáltató adatai",
    operator: [
      { label: "Szolgáltató", value: `${CONTROLLER.name}, magánszemély` },
      { label: "Email", value: CONTROLLER.email, kind: "mail" },
    ],
    note: "A szolgáltatás nem üzleti jellegű és ingyenes. Kapcsolattartás emailben.",
    hostingTitle: "Tárhelyszolgáltató",
    hosting: [
      { label: "Név", value: HOSTING.name },
      { label: "Cím", value: HOSTING.address },
      { label: "Email", value: HOSTING.email, kind: "mail" },
      { label: "Honlap", value: HOSTING.url, kind: "url" },
    ],
  },
  sections: [
    {
      title: "2. A szolgáltatás",
      paragraphs: [
        "A Hallgatói réteg személyes irányítópult tárgyakhoz, határidőkhöz és naptárakhoz: az egyetemi rendszerek (Neptun, Canvas, Moodle, Teams és mások) mellett segít átlátni, mi mikor esedékes. A használata ingyenes.",
        "A szolgáltatás független projekt: nem áll kapcsolatban egyetemmel, a Neptunnal, a Canvasszal, a Moodle-lel, a Teamsszel vagy más rendszerrel. Ezekre a saját feltételeik vonatkoznak.",
      ],
    },
    {
      title: "3. Fiók",
      paragraphs: [
        `Fiókot csak ${MINIMUM_AGE}. életévét betöltött személy hozhat létre.`,
        "Egy fiókot egy személy használ. A jelszavadat őrizd meg, és ne add át másnak. Te felelsz azért, hogy a megadott email cím helyes legyen, és hogy hozzáférj hozzá.",
        "Fiók nélkül is kipróbálhatod a bemutató módot.",
      ],
    },
    {
      title: "4. Pontosság és felelősség",
      prominent: true,
      paragraphs: [
        "A határidők és az órarend abból származnak, amit te viszel be, és a harmadik fél által szolgáltatott naptárakból. Hiányosak, elavultak, duplikáltak vagy hibásak lehetnek: a naptár-források leállhatnak, a szinkronizálás ütközhet.",
        "A hivatalos rendszer (Neptun, Canvas, Moodle, a tárgy saját közleményei) mindig az irányadó. A határidőket ott kell ellenőrizned.",
        "Az email-összefoglaló, az emlékeztetők és a naptár-feliratkozás kényelmi funkciók, a kézbesítésükért és a pontos időzítésükért nem vállalunk garanciát.",
      ],
    },
    {
      title: "5. Elfogadható használat",
      paragraphs: [
        "Tilos a szolgáltatás védelmét megkerülni vagy a szolgáltatást túlterhelni, és tilos a jogszabályba vagy mások jogaiba ütköző használat.",
        "Automatizált hozzáférés vagy adatgyűjtés nem megengedett, kivéve a saját naptáralkalmazásod feliratkozását a saját naptáradra.",
        "Mások személyes adatát csak akkor vidd be, ha ez szükséges.",
        "A naptár-hivatkozások a tieid, a feliratkozási linked megosztásáért te felelsz.",
      ],
    },
    {
      title: "6. Az adataid",
      paragraphs: [
        {
          before: "Az adataid a tieid maradnak. Kizárólag a szolgáltatás nyújtására használjuk őket, ahogy az ",
          link: { kind: "privacy", text: "adatvédelmi tájékoztató" },
          after: " leírja.",
        },
        "Az adataidat bármikor exportálhatod (Beállítások → Adatok), a fiókodat bármikor törölheted (Beállítások → Fiók).",
      ],
    },
    {
      title: "7. A szolgáltatás változása és megszűnése",
      paragraphs: [
        "A szolgáltatást „ahogy van” nyújtjuk: változhat, megszakadhat vagy megszűnhet.",
        "Megszüntetés esetén legalább 30 nappal korábban emailben értesítünk, hogy az adataidat exportálhasd.",
        "A fiókot felfüggeszthetjük vagy törölhetjük, ha súlyosan vagy ismételten megsérted ezeket a feltételeket; ha lehet, emailben előre értesítünk.",
      ],
    },
    {
      title: "8. Felelősség korlátozása",
      paragraphs: [
        "A jogszabály által megengedett mértékben nem felelünk a lekésett határidőkből, hibás vagy hiányzó adatokból, kimaradásból vagy adatvesztésből eredő károkért.",
        "Ez nem korlátozza a szándékos vagy súlyosan gondatlan szerződésszegésért, valamint az élet, testi épség és egészség károsításáért való felelősséget (Ptk. 6:152. §), és nem érinti a fogyasztót megillető kötelező jogokat.",
      ],
    },
    {
      title: "9. Szellemi tulajdon",
      paragraphs: [
        {
          before: "A forráskód nyílt, MIT licenc alatt érhető el: ",
          link: { kind: "source", text: SOURCE_URL },
          after: ".",
        },
        "A „Hallgatói réteg” név a szolgáltatóé. A Neptun, a Canvas, a Moodle és más megnevezések tulajdonosaik védjegyei; csak a kompatibilitás leírására használjuk őket.",
      ],
    },
    {
      title: "10. A feltételek módosítása",
      paragraphs: [
        "A módosításról a fiókkal rendelkezőket legalább 15 nappal a hatályba lépés előtt emailben értesítjük. Ha utána tovább használod a szolgáltatást, elfogadod a módosítást; ha nem, törölheted a fiókodat.",
      ],
    },
    {
      title: "11. Irányadó jog, kapcsolat",
      paragraphs: [
        "A magyar jog az irányadó. A vitákra a hatáskörrel és illetékességgel rendelkező magyar bíróság jogosult, a fogyasztó azon jogának sérelme nélkül, hogy lakóhelye szerinti bíróság előtt is pert indíthat.",
        {
          before: "Kapcsolat: ",
          link: { kind: "mail", text: CONTROLLER.email },
          after: ". Eltérés esetén a magyar nyelvű szöveg az irányadó.",
        },
      ],
    },
  ],
};

const EN: TermsContent = {
  title: "Terms of use",
  sub: `In force from: ${TERMS_UPDATED}. The service provider's details and the rules for using Hallgatói réteg.`,
  translationNote: "This English text is a translation for convenience. The Hungarian text is the authoritative version.",
  provider: {
    title: "1. Service provider",
    operator: [
      { label: "Provider", value: `${CONTROLLER.name}, private individual` },
      { label: "Email", value: CONTROLLER.email, kind: "mail" },
    ],
    note: "The service is non-commercial and free. Contact is by email.",
    hostingTitle: "Hosting provider",
    hosting: [
      { label: "Name", value: HOSTING.name },
      { label: "Address", value: HOSTING.addressEn },
      { label: "Email", value: HOSTING.email, kind: "mail" },
      { label: "Website", value: HOSTING.url, kind: "url" },
    ],
  },
  sections: [
    {
      title: "2. The service",
      paragraphs: [
        "Hallgatói réteg is a personal dashboard for courses, deadlines and calendars: it sits on top of university systems (Neptun, Canvas, Moodle, Teams and others) and helps you see what is due when. It is free to use.",
        "The service is an independent project: it is not affiliated with any university, Neptun, Canvas, Moodle, Teams or any other system. Their own terms apply to them.",
      ],
    },
    {
      title: "3. Account",
      paragraphs: [
        `Only people aged ${MINIMUM_AGE} or over may create an account.`,
        "One account is for one person. Keep your password safe and do not share it. You are responsible for the accuracy of the email address you give and for having access to it.",
        "You can try the demo without an account.",
      ],
    },
    {
      title: "4. Accuracy and responsibility",
      prominent: true,
      paragraphs: [
        "Deadlines and timetables come from what you enter and from calendars provided by third parties. They can be incomplete, outdated, duplicated or wrong: calendar sources can fail and synchronisation can conflict.",
        "The official system (Neptun, Canvas, Moodle, the course's own announcements) is always authoritative. You must check deadlines there.",
        "Email digests, reminders and the calendar subscription are conveniences. Their delivery and timing are not guaranteed.",
      ],
    },
    {
      title: "5. Acceptable use",
      paragraphs: [
        "You must not try to break or overload the service, or use it against the law or others' rights.",
        "Automated access or scraping is not allowed, except for your own calendar app subscribing to your own calendar.",
        "Only enter other people's personal data where necessary.",
        "Calendar links are your own, and you are responsible for sharing your subscription link.",
      ],
    },
    {
      title: "6. Your data",
      paragraphs: [
        {
          before: "Your data remains yours. It is used only to provide the service, as described in the ",
          link: { kind: "privacy", text: "privacy notice" },
          after: ".",
        },
        "You can export your data at any time (Settings → Data) and delete your account at any time (Settings → Account).",
      ],
    },
    {
      title: "7. Changes to and end of the service",
      paragraphs: [
        "The service is provided \"as is\": it may change, be interrupted or be discontinued.",
        "If it is discontinued we will notify you by email at least 30 days in advance, so you can export your data.",
        "We may suspend or delete an account that seriously or repeatedly breaches these terms; where possible we will notify you by email beforehand.",
      ],
    },
    {
      title: "8. Limitation of liability",
      paragraphs: [
        "To the extent the law allows, we are not liable for damage from missed deadlines, wrong or missing data, outages or data loss.",
        "This does not limit liability for intentional or grossly negligent breach, or for damage to life, physical integrity or health (Civil Code 6:152 §), and does not affect your mandatory consumer rights.",
      ],
    },
    {
      title: "9. Intellectual property",
      paragraphs: [
        {
          before: "The source code is open under the MIT licence: ",
          link: { kind: "source", text: SOURCE_URL },
          after: ".",
        },
        "The name \"Hallgatói réteg\" belongs to the provider. Neptun, Canvas, Moodle and other names are trademarks of their owners; we use them only to describe compatibility.",
      ],
    },
    {
      title: "10. Changes to these terms",
      paragraphs: [
        "We will announce changes by email to account holders at least 15 days before they take effect. If you keep using the service after that, you accept the change; if not, you can delete your account.",
      ],
    },
    {
      title: "11. Governing law and contact",
      paragraphs: [
        "Hungarian law applies. Disputes go to the competent Hungarian court, without prejudice to a consumer's right to sue in the courts of their country of residence.",
        {
          before: "Contact: ",
          link: { kind: "mail", text: CONTROLLER.email },
          after: ". If the versions differ, the Hungarian text prevails.",
        },
      ],
    },
  ],
};

export function termsContent(locale: Locale): TermsContent {
  return locale === "en" ? EN : HU;
}
