import type { Locale } from "@/lib/i18n/locales";
import {
  CONTROLLER,
  DATABASE_REGION,
  DATABASE_REGION_EN,
  FUNCTIONS_REGION,
  FUNCTIONS_REGION_EN,
  GRADE_ALERT_SENT_DAYS,
  JEV_CACHE_DAYS,
  JEV_COUNTER_HOURS,
  JEV_MAX_TEXT_CHARS,
  JEV_PROCESSOR,
  MINIMUM_AGE,
  PRIVACY_UPDATED,
  RESEND_RETENTION_DAYS,
  RESEND_SENDING_REGION,
  RESEND_SENDING_REGION_EN,
  VERCEL_LOG_HOURS,
} from "@/lib/legal";

// The text of the privacy notice (/adatvedelem) in both languages. Pure, so it can be tested.
// The Hungarian text is the authoritative one; the English page says so. Every statement must
// match what the code does: change it together with the data it describes, and bump
// PRIVACY_UPDATED in lib/legal.ts.

export interface PrivacyPurpose {
  what: string;
  data: string;
  basis: string;
  until: string;
}

export interface PrivacyContent {
  title: string;
  sub: string;
  /** English page only: points at the authoritative Hungarian text. */
  translationNote?: string;
  controller: {
    title: string;
    beforeMail: string;
    afterMail: string;
    independent: string;
    /** Sentence pointing at the terms of use: text before, the link text, text after. */
    terms: { before: string; link: string; after: string };
  };
  purposes: { title: string; items: PrivacyPurpose[]; basisLabel: string; keepLabel: string; closing: string };
  cookies: { title: string; text: string };
  processors: { title: string; items: { name: string; role: string; where: string }[]; transfers: string; feeds: string };
  rights: {
    title: string;
    items: { label: string; text: string }[];
    complaint: string;
  };
  security: { title: string; text: string };
  changes: { title: string; text: string };
}

const HU: PrivacyContent = {
  title: "Adatvédelmi tájékoztató",
  sub: `Hatályos: ${PRIVACY_UPDATED}. Leírja, milyen személyes adatot kezel a Hallgatói réteg, miért, meddig, és milyen jogaid vannak.`,
  controller: {
    title: "Az adatkezelő",
    beforeMail: `${CONTROLLER.name}, elérhetőség: `,
    afterMail: ". Az adataiddal kapcsolatos kérésekre egy hónapon belül válaszolunk.",
    independent:
      "A Hallgatói réteg független projekt, nem kapcsolódik az egyetemhez, a Neptunhoz, a Canvashoz vagy a Moodle-höz, és nem kap tőlük adatot. Csak azt látjuk, amit te adsz meg, vagy amit a megadott naptár-hivatkozásaid tartalmaznak.",
    terms: { before: "A szolgáltatás használatának szabályait a ", link: "felhasználási feltételek", after: " tartalmazzák." },
  },
  purposes: {
    title: "Milyen adatot, miért és meddig",
    basisLabel: "Jogalap:",
    keepLabel: "Megőrzés:",
    items: [
      {
        what: "Fiók",
        data: `Email cím, a jelszó visszafejthetetlen lenyomata (scrypt), a regisztráció és a megerősítés ideje. Regisztrálni csak ${MINIMUM_AGE}. életévét betöltött személy tud; a fiókra a felhasználási feltételek vonatkoznak.`,
        basis: "Szerződés teljesítése (GDPR 6. cikk (1) b)).",
        until: "A fiók törléséig. A meg nem erősített regisztráció 7 nap után magától törlődik.",
      },
      {
        what: "Nyelvbeállítás",
        data: "A választott nyelv (magyar vagy angol), és hogy te választottad-e ki magad, vagy a böngésződ nyelvéből következik. A fiók adataival együtt tároljuk; ezen a nyelven küldjük a leveleket és állítjuk elő a naptárat.",
        basis: "Szerződés teljesítése (6. cikk (1) b)).",
        until: "A fiók törléséig.",
      },
      {
        what: "Bejelentkezés",
        data: "Munkamenet-azonosító (csak lenyomatként tároljuk), létrehozásának és utolsó használatának ideje, a böngésző típusa (user agent, legfeljebb 200 karakter). Az emailben küldött egyszer használatos linkek lenyomata.",
        basis: "Szerződés teljesítése (6. cikk (1) b)).",
        until: "A munkamenet kilépéskor vagy 90 nap használaton kívül törlődik, a linkek 30 perc (belépés, jelszó) vagy 48 óra (megerősítés, címváltás) után.",
      },
      {
        what: "Tanulmányi adatok",
        data: "Amit te viszel be vagy importálsz: tárgyak, linkek, a tárgyak követelményei és pontozási szabályai, az általad rögzített eredmények (pontok, jegyek, óránkénti jelenlét), hogy melyik összetevő melyik órádhoz, hetéhez vagy határidődhöz tartozik, a félév kezdete, határidők, órarend, valamint a megadott naptár-hivatkozások (Canvas, Moodle, Neptun iCal link). A naptár-hivatkozás a forrásrendszerben hozzáférési kulcsként működik, ezért úgy kezeljük, mint egy jelszót: nem jelenítjük meg mások számára, és csak a naptár letöltésére használjuk.",
        basis: "Szerződés teljesítése (6. cikk (1) b)).",
        until: "A fiók törléséig, vagy amíg nem törlöd őket. A forrásokból letöltött naptárak és az előállított naptárfájlok átmeneti másolata 15 percig marad meg.",
      },
      {
        what: "Naptár feliratkozási link",
        data: "Ha bekapcsolod, egy véletlen azonosító, amellyel a naptáralkalmazásod lekérheti a határidőidet. Aki ismeri a linket, látja a naptár tartalmát (a tárgyak linkjei nélkül), a követelményekhez kötött számonkéréseknél azt is, hány pont kell egy jegyhez (a naptár beállításaiban kikapcsolható).",
        basis: "Szerződés teljesítése (6. cikk (1) b)).",
        until: "Kikapcsolásig, a link cseréjéig vagy a fiók törléséig.",
      },
      {
        what: "Email-összefoglaló",
        data: "Ha feliratkozol: a gyakoriság, a leiratkozási kulcs és az utolsó küldés ideje. A levél a fiókod email címére megy, és a határidőid mellett felsorolja azokat az óráidat és számonkéréseidet is, amelyek eredményét még nem rögzítetted.",
        basis: "Hozzájárulás (6. cikk (1) a)). Bármikor visszavonhatod a beállításokban vagy a levél leiratkozó linkjével.",
        until: "Leiratkozásig vagy a fiók törléséig.",
      },
      {
        what: "Jegy-figyelmeztetések e-mailben",
        data: `Ha bekapcsolod: a kiválasztott figyelmeztetés-fajták, a leiratkozási kulcs és az elküldött figyelmeztetések kulcsai. A figyelmeztetéseket a tárgyaid szabályaiból és az általad rögzített eredményekből számoljuk ki, a levél a fiókod email címére megy; sürgős jelzésről legfeljebb naponta egy levelet küldünk, és az összefoglaló is kiegészül egy „Jegyek” blokkal, ha kapsz ilyet. A csengőben látható figyelmeztetésekhez nem tárolunk a szerveren semmit.`,
        basis: "Hozzájárulás (6. cikk (1) a)). Bármikor visszavonhatod a beállításokban vagy a levél leiratkozó linkjével.",
        until: `Kikapcsolásig vagy a fiók törléséig; az elküldött figyelmeztetések kulcsait ${GRADE_ALERT_SENT_DAYS} nap után töröljük.`,
      },
      {
        what: "Követelményrendszer beolvasása",
        data: `Ha egy tárgy követelményrendszerét beilleszted vagy PDF-ként feltöltöd, és az Értelmezés gombot választod: a PDF-et a böngésződ olvassa be, a fájl nem kerül hozzánk; a beillesztett szöveget (legfeljebb ${JEV_MAX_TEXT_CHARS.toLocaleString("hu-HU")} karakter) és a tárgy nevét és kódját a szerver egyetlen kérésben elküldi a ${JEV_PROCESSOR} szolgáltatásnak. A szöveget nem tároljuk. A Jev válaszait (választások és számok, szöveg nélkül) a kérés lenyomatához (hash) kötve, a fiókodtól függetlenül ${JEV_CACHE_DAYS} napig megőrizzük, hogy ugyanazt ne kérdezzük újra; a nevedet, az email címedet és az eredményeidet nem küldjük el. A kérések számát a fiókodhoz kötve számoljuk. Az eredményt te hagyod jóvá: a Jev olvasata javaslat, amelyet mentés előtt átnézhetsz és javíthatsz.`,
        basis: "Szerződés teljesítése (6. cikk (1) b)): a kérésedre végzett szolgáltatás.",
        until: `A szöveg csak a kérés idejéig van nálunk. A Jev válaszai (szöveg nélkül) ${JEV_CACHE_DAYS} napig, a kérésszámláló ${JEV_COUNTER_HOURS} óráig.`,
      },
      {
        what: "Tárgy-, összetevő- és ismétlődés-javaslatok",
        data: `Ha egy naptár- vagy órarend-tárgyat, illetve két egy napra eső határidőt a saját szabályaink nem tudnak egyértelműen eldönteni, a szerver a ${JEV_PROCESSOR} szolgáltatásnak elküldi a tárgyneveket, illetve a két határidő címét, forrását és időpontját, és megkérdezi, melyik tárgyadhoz tartozik, vagy ugyanarról a feladatról van-e szó. Ha egy követelmény-összetevőhöz határidőt kötsz, és a saját szabályaink nem találnak hozzá illőt, a határidők címét és az összetevők nevét is elküldhetjük, hogy melyik határidő melyik összetevőhöz tartozik. A kérdés nem tartalmaz azonosítót, nevet vagy email címet. A válaszokat a kérdés visszafejthetetlen lenyomata alatt ${JEV_CACHE_DAYS} napig tároljuk, és mindenki ugyanarra a kérdésre ezt kapja, így egy kérdést csak egyszer teszünk fel. A javaslatot te hagyod jóvá, vagy utasíthatod el.`,
        basis: "Jogos érdek (6. cikk (1) f)): a tárgyak és a kétszer szereplő határidők rendezése helyetted, a lehető legkevesebb adattal.",
        until: `A válaszok ${JEV_CACHE_DAYS} napig, a napi kérésszámláló ${JEV_COUNTER_HOURS} óráig.`,
      },
      {
        what: "Közös követelmény-sablonok",
        data: "Ha megadod az egyetemed, és egy tárgy beolvasott vagy átvett szabályait elmented, a szabályok (az összetevők, a pontozás és a jegyszámítás, megjegyzések nélkül) az egyetem, a tárgykód és a félév szerint közös sablonba kerülnek, amelyet az egyetemed hallgatói ugyanezzel a tárgykóddal átvehetnek. A sablonban nincs név, email cím vagy eredmény; a fiókod azonosítójának visszafejthetetlen lenyomatát tároljuk, hogy ne számoljunk kétszer. A megosztást a beolvasáskor kikapcsolhatod.",
        basis: "Szerződés teljesítése (6. cikk (1) b)).",
        until: "Az egyetemed a fiókod törléséig vagy módosításáig marad meg. A fiók törlésekor a lenyomatodat minden sablonból töröljük; a mások által is megerősített szabályok megmaradnak, mert nem tartalmaznak rólad adatot.",
      },
      {
        what: "Visszaélés elleni védelem",
        data: "IP-cím, a belépési, regisztrációs és levélküldési kísérletek számlálásához. Az email címeket a számlálókban csak lenyomatként tároljuk.",
        basis: "Jogos érdek (6. cikk (1) f)): a fiókok védelme a jelszópróbálgatás és a tömeges levélküldés ellen.",
        until: "Legfeljebb 1 óra.",
      },
    ],
    closing:
      "Hirdetést nem jelenítünk meg, a viselkedésedet nem elemezzük, profilt nem készítünk, és az adataidat nem adjuk el és nem adjuk át harmadik félnek, csak az alább felsorolt adatfeldolgozóknak.",
  },
  cookies: {
    title: "Süti és helyi tárolás",
    text: "Három sütit használunk. A hr_session belépve tart (a munkamenet-azonosítót tartalmazza, kilépésig vagy 90 napig él). A hr_lang a választott nyelvet jegyzi meg (csak a „hu” vagy az „en” értéket tartalmazza, 1 évig él, azonosítót nem hordoz). A hr_demo csak akkor jön létre, ha regisztráció nélkül kipróbálod az oldalt: azt jelzi, hogy a bemutatóban vagy (értéke „1”, a böngésző bezárásáig vagy a bemutatóból való kilépésig él). Mindhárom a kért szolgáltatás működéséhez szükséges, ezért nem kér hozzájárulást. A bemutató mintaadatai és a bennük tett változtatások csak az adott böngészőlap tárolójában vannak, a szerverre nem kerülnek, és a lap bezárásával törlődnek. A böngésződ helyi tárolójában a fiókod adatainak egy másolata és az eszközbeállításaid (például a téma) maradnak, hogy az oldal gyorsan betöltsön; kilépéskor ezt a másolatot töröljük. Hogy az oldal internetkapcsolat nélkül is megnyíljon, a böngésző a meglátogatott oldalakat és az oldal fájljait (szkriptek, stílusok, ikonok) a gyorsítótárában (service worker) tárolja; az oldalak másolatát kilépéskor és fióktörléskor töröljük. A fiókod adatait szállító (API) kérések válaszait nem tárolja el. Elemző, követő vagy hirdetési sütit nem használunk, a betűtípust is a saját szerverünkről töltjük.",
  },
  processors: {
    title: "Adatfeldolgozók",
    items: [
      {
        name: "Vercel Inc.",
        role: "Tárhely és a weboldal kiszolgálása (a kérések rendszernaplóival együtt).",
        where: `Egyesült államokbeli cég. A szerveroldali feldolgozás ${FUNCTIONS_REGION} történik; a kérések rendszernaplóit legfeljebb ${VERCEL_LOG_HOURS} óráig őrzi.`,
      },
      { name: "Upstash, Inc.", role: "Adatbázis: a fiók, a tanulmányi adatok és a fenti átmeneti adatok tárolása.", where: `Az adatbázis helye ${DATABASE_REGION}.` },
      {
        name: "Plus Five Five, Inc. (Resend)",
        role: "A megerősítő, belépő, összefoglaló és jegy-figyelmeztető levelek kézbesítése: email cím és a levél tartalma.",
        where: `Egyesült államokbeli cég. A leveleket ${RESEND_SENDING_REGION} küldi; a kézbesítési adatokat és naplókat az Egyesült Államokban, legfeljebb ${RESEND_RETENTION_DAYS} napig őrzi.`,
      },
      {
        name: JEV_PROCESSOR,
        role: "A beillesztett vagy feltöltött követelményrendszer értelmezése (a szöveg és a tárgy neve, kódja; a szöveg tartalmazhatja az oktatók nevét, de a te adataidat nem), valamint tárgy-, összetevő- és ismétlődés-javaslatok (csak a tárgy- és összetevőnevek, valamint a határidők címe, forrása és időpontja, a te adataid nélkül).",
        where: "A szolgáltató nem teszi közzé, hol fut; saját nyilatkozata szerint a kéréseket nem használja modelltanításra.",
      },
    ],
    transfers:
      "Az Egyesült Államokba irányuló adattovábbítás az EU–USA adatvédelmi keretrendszerről szóló megfelelőségi határozaton vagy az Európai Bizottság általános szerződési feltételein alapul; a Vercel a keretrendszer szerint tanúsított. A Resenddel és az Upstash-sel adatfeldolgozási szerződés köt minket. A Vercel a saját felhasználási feltételei és adatvédelmi szabályzata szerint kezeli az adatokat; ingyenes csomagjához külön adatfeldolgozási szerződést nem kínál. A TypeSafe AI (Jev) nem teszi közzé, hol dolgozza fel a kéréseket, ezért az esetleges harmadik országba történő továbbítás jogalapját nem tudjuk megnevezni. Ezért a fiókodhoz tartozó adatot (e-mail-cím, eredmények, azonosító) nem küldünk neki, csak az általad beküldött követelményszöveget és a tárgy adatait; ha nem szeretnéd, hogy a szöveg hozzá kerüljön, az Értelmezés helyett a szabályokat kézzel is megadhatod.",
    feeds:
      "Ha naptár-hivatkozást adsz meg, a szerverünk erről a címről tölti le a naptárat (az egyetem vagy a platform szerveréről). Ehhez a kéréshez a te adataidból semmit nem küldünk el.",
  },
  rights: {
    title: "Jogaid",
    items: [
      {
        label: "Hozzáférés és adathordozhatóság:",
        text: " a Beállítások → Adatok fülön bármikor letöltheted az összes tanulmányi adatodat JSON-fájlban; a fiókadataidról levélben is kérhetsz másolatot.",
      },
      {
        label: "Helyesbítés:",
        text: " az adataidat az alkalmazásban szerkesztheted, az email címedet a Beállítások → Fiók fülön módosíthatod.",
      },
      {
        label: "Törlés:",
        text: " a Beállítások → Fiók → Fiók törlése azonnal és véglegesen töröl minden adatot, ami a fiókodhoz tartozik. A tárhelyszolgáltató biztonsági mentéseiből a másolat a mentések lejártával tűnik el. A korábban elküldött email-hivatkozások (belépés, megerősítés) a törlés után nem használhatók, és 48 órán belül egyébként is lejárnak.",
      },
      {
        label: "Tiltakozás, korlátozás, a hozzájárulás visszavonása:",
        text: " írj a fenti címre. A hozzájárulás visszavonása nem érinti a korábbi adatkezelés jogszerűségét.",
      },
    ],
    complaint:
      "Ha úgy érzed, megsértettük a jogaidat, panaszt tehetsz a Nemzeti Adatvédelmi és Információszabadság Hatóságnál (NAIH, 1055 Budapest, Falk Miksa utca 9–11., naih.hu), vagy bírósághoz fordulhatsz. Kérjük, előbb írj nekünk, hátha gyorsabban meg tudjuk oldani.",
  },
  security: {
    title: "Biztonság",
    text: "A jelszavakat és a belépési azonosítókat csak visszafejthetetlen lenyomatként tároljuk, a kapcsolat titkosított (HTTPS), a belépési kísérleteket korlátozzuk. Ha az adataidat érintő biztonsági incidens történik, a jogszabály szerint értesítünk.",
  },
  changes: {
    title: "Változások",
    text: "Ha a tájékoztató lényegesen változik, a fiókod email címén értesítünk. A fenti dátum mindig az utolsó módosításé.",
  },
};

const EN: PrivacyContent = {
  title: "Privacy notice",
  sub: `In force from: ${PRIVACY_UPDATED}. Describes what personal data Hallgatói réteg processes, why, for how long, and what rights you have.`,
  translationNote: "This English text is a translation for convenience. The Hungarian text is the authoritative version.",
  controller: {
    title: "The controller",
    beforeMail: `${CONTROLLER.name}, contact: `,
    afterMail: ". We answer requests about your data within one month.",
    independent:
      "Hallgatói réteg is an independent project. It is not affiliated with any university, Neptun, Canvas or Moodle, and receives no data from them. We only see what you enter or what the calendar links you provide contain.",
    terms: { before: "The rules for using the service are set out in the ", link: "terms of use", after: "." },
  },
  purposes: {
    title: "What data, why and for how long",
    basisLabel: "Legal basis:",
    keepLabel: "Retention:",
    items: [
      {
        what: "Account",
        data: `Email address, an irreversible hash of the password (scrypt), the time of registration and confirmation. Only people aged ${MINIMUM_AGE} or over can register; the account is governed by the terms of use.`,
        basis: "Performance of a contract (GDPR Art. 6(1)(b)).",
        until: "Until the account is deleted. An unconfirmed registration is deleted automatically after 7 days.",
      },
      {
        what: "Language preference",
        data: "The language you chose (Hungarian or English), and whether you chose it yourself or it follows from your browser's language. It is stored with the account; emails are sent and the calendar is generated in this language.",
        basis: "Performance of a contract (Art. 6(1)(b)).",
        until: "Until the account is deleted.",
      },
      {
        what: "Sign-in",
        data: "A session identifier (stored only as a hash), the time it was created and last used, the browser type (user agent, at most 200 characters). A hash of the single-use links sent by email.",
        basis: "Performance of a contract (Art. 6(1)(b)).",
        until: "A session is deleted when you sign out or after 90 days of non-use; links after 30 minutes (sign-in, password) or 48 hours (confirmation, address change).",
      },
      {
        what: "Study data",
        data: "What you enter or import: courses, links, the requirements and scoring rules of courses, the results you record (points, grades, attendance per class), which component belongs to which class, week or deadline, the start of the semester, deadlines, timetable, and the calendar links you provide (Canvas, Moodle, Neptun iCal link). A calendar link works as an access key in the source system, so we treat it like a password: we do not show it to others and use it only to download the calendar.",
        basis: "Performance of a contract (Art. 6(1)(b)).",
        until: "Until the account is deleted or you delete them. Temporary copies of calendars downloaded from the sources and of generated calendar files are kept for 15 minutes.",
      },
      {
        what: "Calendar subscription link",
        data: "If you turn it on, a random identifier that lets your calendar app fetch your deadlines. Anyone who knows the link can see the calendar's content (without the courses' links), including, for tests linked to your requirements, the score you need for a grade (this can be turned off in the calendar settings).",
        basis: "Performance of a contract (Art. 6(1)(b)).",
        until: "Until you turn it off, replace the link or delete the account.",
      },
      {
        what: "Email digest",
        data: "If you subscribe: the frequency, the unsubscribe key and the time of the last email. The email goes to your account's email address, and besides your deadlines it lists the classes and assessments whose result you have not recorded yet.",
        basis: "Consent (Art. 6(1)(a)). You can withdraw it at any time in the settings or with the unsubscribe link in the email.",
        until: "Until you unsubscribe or the account is deleted.",
      },
      {
        what: "Grade alerts by email",
        data: `If you turn it on: the alert kinds you chose, the unsubscribe key and the keys of the alerts already sent. The alerts are computed from your courses' rules and the results you recorded, and the email goes to your account's email address; we send at most one email a day for urgent alerts, and the digest gets a "Grades" block if you receive one. We store nothing on the server for the alerts shown in the bell.`,
        basis: "Consent (Art. 6(1)(a)). You can withdraw it at any time in the settings or with the unsubscribe link in the email.",
        until: `Until you turn it off or the account is deleted; the keys of sent alerts are deleted after ${GRADE_ALERT_SENT_DAYS} days.`,
      },
      {
        what: "Reading requirements",
        data: `If you paste a course's requirements or upload them as a PDF and choose Interpret: your browser reads the PDF, the file never reaches us; the pasted text (at most ${JEV_MAX_TEXT_CHARS.toLocaleString("en-GB")} characters) and the course's name and code are sent by the server in a single request to ${JEV_PROCESSOR}. We do not store the text. Jev's answers (choices and numbers, no text) are kept for ${JEV_CACHE_DAYS} days under a hash of the request, independent of your account, so that we do not ask the same thing twice; your name, email address and results are not sent. The number of requests is counted against your account. You approve the outcome: Jev's reading is a suggestion that you can review and correct before saving.`,
        basis: "Performance of a contract (Art. 6(1)(b)): a service carried out at your request.",
        until: `The text is with us only for the duration of the request. Jev's answers (without text) are kept for ${JEV_CACHE_DAYS} days, the request counter for ${JEV_COUNTER_HOURS} hours.`,
      },
      {
        what: "Course, component and duplicate suggestions",
        data: `If our own rules cannot settle which course a calendar or timetable subject belongs to, or whether two deadlines on the same day are the same, the server sends ${JEV_PROCESSOR} the subject names, or the title, source and time of the two deadlines, and asks which of your courses it belongs to or whether they are the same task. If you link a deadline to a requirement component and our own rules find no match, the deadlines' titles and the component names may also be sent, to tell which deadline belongs to which component. The question contains no identifier, name or email address. The answers are stored under an irreversible hash of the question for ${JEV_CACHE_DAYS} days, and everyone asking the same question gets the same answer, so a question is asked only once. You approve a suggestion or reject it.`,
        basis: "Legitimate interest (Art. 6(1)(f)): sorting out courses and duplicated deadlines for you, with as little data as possible.",
        until: `The answers for ${JEV_CACHE_DAYS} days, the daily request counter for ${JEV_COUNTER_HOURS} hours.`,
      },
      {
        what: "Shared requirement templates",
        data: "If you give your university and save the rules of a course that were read or taken over, the rules (the components, scoring and grading, without notes) go into a shared template by university, subject code and semester, which students of your university can take over for the same subject code. The template holds no name, email address or result; we store an irreversible hash of your account identifier so that we do not count twice. You can turn sharing off when reading the requirements.",
        basis: "Performance of a contract (Art. 6(1)(b)).",
        until: "Your university is kept until you delete the account or change it. When you delete the account, your hash is removed from every template; rules that others have also confirmed remain, because they hold no data about you.",
      },
      {
        what: "Abuse protection",
        data: "IP address, to count sign-in, registration and email-sending attempts. Email addresses are stored in the counters only as hashes.",
        basis: "Legitimate interest (Art. 6(1)(f)): protecting accounts against password guessing and mass mailing.",
        until: "At most 1 hour.",
      },
    ],
    closing:
      "We show no advertising, we do not analyse your behaviour, we do not build profiles, and we neither sell nor pass on your data to third parties, except to the processors listed below.",
  },
  cookies: {
    title: "Cookies and local storage",
    text: "We use three cookies. hr_session keeps you signed in (it holds the session identifier and lasts until you sign out or 90 days). hr_lang remembers the language you chose (it only contains “hu” or “en”, lasts 1 year and carries no identifier). hr_demo is only set if you try the site without registering: it marks that you are in the demo (its value is “1”, and it lasts until you close the browser or leave the demo). All three are strictly necessary for the service you asked for, so they do not ask for consent. The demo's sample data and your changes to it stay in that browser tab's storage only, are never sent to the server, and are deleted when you close the tab. Your browser's local storage keeps a copy of your account's data and your device settings (such as the theme) so that the page loads quickly; we delete that copy when you sign out. So that the site also opens without an internet connection, the browser stores the pages you visited and the site’s files (scripts, styles, icons) in its cache (a service worker); we delete the copies of the pages when you sign out or delete your account. Responses of the API calls that carry your account data are never cached. We use no analytics, tracking or advertising cookies, and the font is loaded from our own server.",
  },
  processors: {
    title: "Processors",
    items: [
      {
        name: "Vercel Inc.",
        role: "Hosting and serving the website (including system logs of requests).",
        where: `A US company. Server-side processing takes place in ${FUNCTIONS_REGION_EN}; it keeps the system logs of requests for at most ${VERCEL_LOG_HOURS} hour.`,
      },
      { name: "Upstash, Inc.", role: "Database: storing the account, the study data and the temporary data above.", where: `The database is located in ${DATABASE_REGION_EN}.` },
      {
        name: "Plus Five Five, Inc. (Resend)",
        role: "Delivering confirmation, sign-in, digest and grade-alert emails: the email address and the content of the email.",
        where: `A US company. It sends the emails from ${RESEND_SENDING_REGION_EN}; it keeps the delivery data and logs in the United States for at most ${RESEND_RETENTION_DAYS} days.`,
      },
      {
        name: JEV_PROCESSOR,
        role: "Interpreting a pasted or uploaded requirements text (the text and the course's name and code; the text may contain teachers' names, but none of your data), and course, component and duplicate suggestions (only the course and component names, and the deadlines' title, source and time, without your data).",
        where: "The provider does not publish where it runs; by its own statement it does not use requests for model training.",
      },
    ],
    transfers:
      "Transfers to the United States rely on the adequacy decision on the EU–US Data Privacy Framework or on the European Commission's standard contractual clauses; Vercel is certified under the Framework. We have data processing agreements with Resend and Upstash. Vercel processes the data under its own terms of service and privacy policy; it does not offer a separate data processing agreement for its free plan. TypeSafe AI (Jev) does not publish where it processes requests, so we cannot name the legal basis of any transfer to a third country. For that reason we never send it your account data (email address, results, identifiers), only the requirements text and course details you submit; if you do not want the text to reach it, you can enter the rules by hand instead of choosing Interpret.",
    feeds:
      "If you provide a calendar link, our server downloads the calendar from that address (from the university's or the platform's server). We send none of your data with that request.",
  },
  rights: {
    title: "Your rights",
    items: [
      {
        label: "Access and portability:",
        text: " on the Settings → Data tab you can download all your study data as a JSON file at any time; you can also ask for a copy of your account data by email.",
      },
      {
        label: "Rectification:",
        text: " you can edit your data in the app, and change your email address on the Settings → Account tab.",
      },
      {
        label: "Erasure:",
        text: " Settings → Account → Delete account immediately and permanently deletes all data that belongs to your account. Copies in the hosting provider's backups disappear when the backups expire. Email links already sent (sign-in, confirmation) can no longer be used after deletion, and they expire within 48 hours anyway.",
      },
      {
        label: "Objection, restriction, withdrawal of consent:",
        text: " write to the address above. Withdrawing consent does not affect the lawfulness of earlier processing.",
      },
    ],
    complaint:
      "If you feel we have violated your rights, you can lodge a complaint with the Hungarian National Authority for Data Protection and Freedom of Information (NAIH, Falk Miksa utca 9–11, 1055 Budapest, naih.hu) or go to court. Please write to us first; we may be able to solve it faster.",
  },
  security: {
    title: "Security",
    text: "We store passwords and sign-in identifiers only as irreversible hashes, the connection is encrypted (HTTPS), and we limit sign-in attempts. If a security incident affects your data, we notify you as required by law.",
  },
  changes: {
    title: "Changes",
    text: "If the notice changes materially, we notify you at your account's email address. The date above is always that of the last change.",
  },
};

export function privacyContent(locale: Locale): PrivacyContent {
  return locale === "hu" ? HU : EN;
}
