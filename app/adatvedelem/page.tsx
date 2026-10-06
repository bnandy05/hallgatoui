import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CONTROLLER, DATABASE_REGION, PRIVACY_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Adatvédelmi tájékoztató" };

// The privacy notice (GDPR Art. 13). Public: the proxy lets it through without a session. Every
// statement here must match what the code does; change it together with the data it describes.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground">
      <h2 className="font-display text-[22px] text-heading">{title}</h2>
      {children}
    </Card>
  );
}

interface Purpose {
  what: string;
  data: string;
  basis: string;
  until: string;
}

const PURPOSES: Purpose[] = [
  {
    what: "Fiók",
    data: "E-mail-cím, a jelszó visszafejthetetlen lenyomata (scrypt), a regisztráció és a megerősítés ideje.",
    basis: "Szerződés teljesítése (GDPR 6. cikk (1) b)).",
    until:
      "A fiók törléséig. A meg nem erősített regisztráció 7 nap után magától törlődik.",
  },
  {
    what: "Bejelentkezés",
    data:
      "Munkamenet-azonosító (csak lenyomatként tároljuk), létrehozásának és utolsó használatának ideje, a böngésző típusa (user agent, legfeljebb 200 karakter). Az e-mailben küldött egyszer használatos linkek lenyomata.",
    basis: "Szerződés teljesítése (6. cikk (1) b)).",
    until:
      "A munkamenet kilépéskor vagy 90 nap használaton kívül törlődik, a linkek 30 perc (belépés, jelszó) vagy 48 óra (megerősítés, címváltás) után.",
  },
  {
    what: "Tanulmányi adatok",
    data:
      "Amit te viszel be vagy importálsz: tárgyak, linkek, a tárgyak követelményei és pontozási szabályai, az általad rögzített eredmények (pontok, jegyek, hiányzások), határidők, órarend, valamint a megadott naptár-hivatkozások (Canvas, Moodle, Neptun iCal link). A naptár-hivatkozás a forrásrendszerben hozzáférési kulcsként működik, ezért úgy kezeljük, mint egy jelszót: nem jelenítjük meg mások számára, és csak a naptár letöltésére használjuk.",
    basis: "Szerződés teljesítése (6. cikk (1) b)).",
    until:
      "A fiók törléséig, vagy amíg nem törlöd őket. A forrásokból letöltött naptárak és az előállított naptárfájlok átmeneti másolata 15 percig marad meg.",
  },
  {
    what: "Naptár feliratkozási link",
    data:
      "Ha bekapcsolod, egy véletlen azonosító, amellyel a naptáralkalmazásod lekérheti a határidőidet. Aki ismeri a linket, látja a naptár tartalmát (a tárgyak linkjei nélkül).",
    basis: "Szerződés teljesítése (6. cikk (1) b)).",
    until: "Kikapcsolásig, a link cseréjéig vagy a fiók törléséig.",
  },
  {
    what: "E-mail-összefoglaló",
    data:
      "Ha feliratkozol: a gyakoriság, a leiratkozási kulcs és az utolsó küldés ideje. A levél a fiókod e-mail-címére megy.",
    basis: "Hozzájárulás (6. cikk (1) a)). Bármikor visszavonhatod a beállításokban vagy a levél leiratkozó linkjével.",
    until: "Leiratkozásig vagy a fiók törléséig.",
  },
  {
    what: "Követelményrendszer beolvasása",
    data:
      "Ha egy tárgy követelményrendszerét beilleszted vagy PDF-ként feltöltöd, és az Értelmezés gombot választod: a PDF-et a böngésződ olvassa be, a fájl nem kerül hozzánk; a szöveget a szerver egyszer feldolgozza, és csak azokat a mondatait küldi tovább a TypeSafe AI-nak (Jev), amelyek nem egyértelműek. A szöveget, a mondatokat és a válaszokat nem tároljuk; a nevedet, az e-mail-címedet és az eredményeidet nem küldjük el. A kérések számát a fiókodhoz kötve számoljuk.",
    basis: "Szerződés teljesítése (6. cikk (1) b)): a kérésedre végzett szolgáltatás.",
    until: "A szöveg csak a kérés idejéig van nálunk. A kérésszámláló 24 óra után törlődik.",
  },
  {
    what: "Közös követelmény-sablonok",
    data:
      "Ha megadod az egyetemed, és egy tárgy beolvasott vagy átvett szabályait elmented, a szabályok (az összetevők, a pontozás és a jegyszámítás, megjegyzések nélkül) az egyetem, a tárgykód és a félév szerint közös sablonba kerülnek, amelyet az egyetemed hallgatói ugyanezzel a tárgykóddal átvehetnek. A sablonban nincs név, e-mail-cím vagy eredmény; a fiókod azonosítójának visszafejthetetlen lenyomatát tároljuk, hogy ne számoljunk kétszer. A megosztást a beolvasáskor kikapcsolhatod.",
    basis: "Szerződés teljesítése (6. cikk (1) b)).",
    until:
      "Az egyetemed a fiókod törléséig vagy módosításáig marad meg. A fiók törlésekor a lenyomatodat minden sablonból töröljük; a mások által is megerősített szabályok megmaradnak, mert nem tartalmaznak rólad adatot.",
  },
  {
    what: "Visszaélés elleni védelem",
    data:
      "IP-cím, a belépési, regisztrációs és levélküldési kísérletek számlálásához. Az e-mail-címeket a számlálókban csak lenyomatként tároljuk.",
    basis: "Jogos érdek (6. cikk (1) f)): a fiókok védelme a jelszópróbálgatás és a tömeges levélküldés ellen.",
    until: "Legfeljebb 1 óra.",
  },
];

const PROCESSORS = [
  {
    name: "Vercel Inc.",
    role: "Tárhely és a weboldal kiszolgálása (a kérések rendszernaplóival együtt).",
    where: "Egyesült Államok.",
  },
  {
    name: "Upstash, Inc.",
    role: "Adatbázis: a fiók, a tanulmányi adatok és a fenti átmeneti adatok tárolása.",
    where: `Az adatbázis helye ${DATABASE_REGION}.`,
  },
  {
    name: "Resend",
    role: "A megerősítő, belépő és összefoglaló levelek kézbesítése: e-mail-cím és a levél tartalma.",
    where: "Egyesült Államok.",
  },
  {
    name: "TypeSafe AI (Jev)",
    role: "A beillesztett követelményrendszer nem egyértelmű mondatainak értelmezése (csak ezek a mondatok, személyes adat nélkül).",
    where: "A szolgáltató nem teszi közzé, hol fut; saját nyilatkozata szerint a kéréseket nem használja modelltanításra.",
  },
];

export default function PrivacyPage() {
  const mail = (
    <a href={`mailto:${CONTROLLER.email}`} className="font-semibold text-heading underline underline-offset-2">
      {CONTROLLER.email}
    </a>
  );

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <SectionHeading
        as="h1"
        title="Adatvédelmi tájékoztató"
        sub={`Hatályos: ${PRIVACY_UPDATED}. Leírja, milyen személyes adatot kezel a Hallgatói réteg, miért, meddig, és milyen jogaid vannak.`}
      />

      <Section title="Az adatkezelő">
        <p>
          {CONTROLLER.name}, elérhetőség: {mail}. Az adataiddal kapcsolatos kérésekre egy hónapon belül válaszolunk.
        </p>
        <p>
          A Hallgatói réteg független projekt, nem kapcsolódik az egyetemhez, a Neptunhoz, a Canvashoz vagy a Moodle-höz, és
          nem kap tőlük adatot. Csak azt látjuk, amit te adsz meg, vagy amit a megadott naptár-hivatkozásaid tartalmaznak.
        </p>
      </Section>

      <Section title="Milyen adatot, miért és meddig">
        <dl className="flex flex-col divide-y divide-border">
          {PURPOSES.map((p) => (
            <div key={p.what} className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
              <dt className="font-semibold text-heading">{p.what}</dt>
              <dd>{p.data}</dd>
              <dd className="text-muted">
                <span className="font-semibold">Jogalap:</span> {p.basis}
              </dd>
              <dd className="text-muted">
                <span className="font-semibold">Megőrzés:</span> {p.until}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Hirdetést nem jelenítünk meg, a viselkedésedet nem elemezzük, profilt nem készítünk, és az adataidat nem adjuk el
          és nem adjuk át harmadik félnek, csak az alább felsorolt adatfeldolgozóknak.
        </p>
      </Section>

      <Section title="Süti és helyi tárolás">
        <p>
          Egyetlen sütit használunk, a <code className="font-semibold">hr_session</code> nevűt, amely belépve tart. Ez a
          szolgáltatáshoz feltétlenül szükséges, ezért nem kér hozzájárulást. A böngésződ helyi tárolójában a fiókod
          adatainak egy másolata és az eszközbeállításaid (például a téma) maradnak, hogy az oldal gyorsan betöltsön;
          kilépéskor ezt a másolatot töröljük. Elemző, követő vagy hirdetési sütit nem használunk, a betűtípust is a saját
          szerverünkről töltjük.
        </p>
      </Section>

      <Section title="Adatfeldolgozók">
        <ul className="flex flex-col gap-3">
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <span className="font-semibold text-heading">{p.name}</span>: {p.role} {p.where}
            </li>
          ))}
        </ul>
        <p>
          Az Egyesült Államokba irányuló adattovábbítás az EU–USA adatvédelmi keretrendszerről szóló megfelelőségi
          határozaton vagy az Európai Bizottság általános szerződési feltételein alapul. Mindhárom szolgáltatóval
          adatfeldolgozási szerződés köt minket.
        </p>
        <p>
          Ha naptár-hivatkozást adsz meg, a szerverünk erről a címről tölti le a naptárat (az egyetem vagy a platform
          szerveréről). Ehhez a kéréshez a te adataidból semmit nem küldünk el.
        </p>
      </Section>

      <Section title="Jogaid">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <span className="font-semibold">Hozzáférés és adathordozhatóság:</span> a Beállítások → Adatok fülön bármikor
            letöltheted az összes tanulmányi adatodat JSON-fájlban; a fiókadataidról levélben is kérhetsz másolatot.
          </li>
          <li>
            <span className="font-semibold">Helyesbítés:</span> az adataidat az alkalmazásban szerkesztheted, az
            e-mail-címedet a Beállítások → Fiók fülön módosíthatod.
          </li>
          <li>
            <span className="font-semibold">Törlés:</span> a Beállítások → Fiók → Fiók törlése azonnal és véglegesen
            töröl minden adatot, ami a fiókodhoz tartozik. A tárhelyszolgáltató biztonsági mentéseiből a másolat a mentések
            lejártával tűnik el.
          </li>
          <li>
            <span className="font-semibold">Tiltakozás, korlátozás, a hozzájárulás visszavonása:</span> írj a fenti
            címre. A hozzájárulás visszavonása nem érinti a korábbi adatkezelés jogszerűségét.
          </li>
        </ul>
        <p>
          Ha úgy érzed, megsértettük a jogaidat, panaszt tehetsz a Nemzeti Adatvédelmi és Információszabadság Hatóságnál
          (NAIH, 1055 Budapest, Falk Miksa utca 9–11., naih.hu), vagy bírósághoz fordulhatsz. Kérjük, előbb írj nekünk, hátha
          gyorsabban meg tudjuk oldani.
        </p>
      </Section>

      <Section title="Biztonság">
        <p>
          A jelszavakat és a belépési azonosítókat csak visszafejthetetlen lenyomatként tároljuk, a kapcsolat titkosított
          (HTTPS), a belépési kísérleteket korlátozzuk. Ha az adataidat érintő biztonsági incidens történik, a jogszabály
          szerint értesítünk.
        </p>
      </Section>

      <Section title="Változások">
        <p>
          Ha a tájékoztató lényegesen változik, a fiókod e-mail-címén értesítünk. A fenti dátum mindig az utolsó
          módosításé.
        </p>
      </Section>
    </div>
  );
}
