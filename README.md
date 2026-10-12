# Hallgatói réteg

**[English](#english)** · **[Magyar](#magyar)**

<a id="english"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-header-dark-en.svg">
  <img src="docs/brand/readme-header-light-en.svg" alt="Hallgatói réteg – all your courses, deadlines and classes in one place" width="100%">
</picture>

Neptun for the timetable, Canvas for assignments, Moodle for the other half of your courses, Teams and Discord for everything in between. **Hallgatói réteg** ("student layer") sits on top of all of them: every course's links, materials and deadlines on one board, plus **a single merged calendar** you can subscribe to from Apple or Google Calendar.

Live: <https://hallgatoireteg.hu>

## What it does

### Courses
Each course gets its own page with its platform links (Neptun, Canvas, Teams, Moodle or any custom platform), materials (notes, past exams, solutions, videos), deadlines and weekly classes. One click takes you to the right place.

### Calendar import
Add a Canvas, Moodle or any other iCal feed and the deadlines land on the right course automatically. Canvas courses found in a feed can be turned into courses in the app, and their Canvas links are added for you. When you connect a feed mid-semester, everything already past can be marked done in one go. Feeds keep syncing in the background, and your own ticks and flags survive every sync.

### Timetable import
Import the timetable exported from Neptun (Calendar → Export) as a link or an `.ics` file. A file is parsed in your browser. Map each subject to a course once; the mapping survives re-imports. Classes then show up in the weekly view, on the course page and in the calendar subscription. Only the current week and later are imported, so last semester never gets in the way.

### Deadline radar
Deadlines grouped by week and sorted by urgency: overdue, critical (within 48 hours or flagged by you), within a week, later. Includes a weekly summary. Deadlines from a feed can't be edited, only marked done or critical, so your board always matches the source.

### Merged calendar subscription
One `.ics` link with every source plus your own deadlines, rendered by the server from your account, so edits show up straight away:
- finished items drop out; critical ones get a 🔴 and reminders 1 day and 1 hour before;
- **views**: everything, critical only, exams, timetable or a single course (`?nezet=…`), so you can subscribe to each course in its own colour;
- a **📋 Heti radar** (weekly summary) every Monday and a **📚 Készülés** (study) block on the two days before a critical deadline;
- if a source moves a deadline, it is tagged **(módosult)** (changed) for 48 hours;
- the server re-fetches the source feeds itself and warns you if one has been unreachable for over 24 hours.

### Duplicate merging
The same exam announced on Canvas, Moodle and Neptun shows up once, with a "+N sources" tag. Mark a pair as "not a duplicate" if the match is wrong. Applies to both the app and the calendar, and can be turned off.

### Adding deadlines
Add one-off deadlines, several dates at once, or a recurring series (e.g. weekly quizzes, numbered automatically). For quick capture, `Ctrl K` / `⌘K` opens a search and quick-add bar that understands Hungarian dates and course names, e.g. `analízis zh péntek 10:00 !` adds a critical deadline to your Analysis course for Friday 10:00. Search ignores accents.

### Reminders
- The header bell lists what is overdue, critical or coming up soon.
- Browser notifications for upcoming deadlines while a tab is open.
- An optional **email digest** (daily, weekly or monthly) sent to your account address. The daily one only goes out when something is due today or tomorrow, and lists today's classes too.

### Everywhere you are
Your data belongs to your account and syncs across devices. Changes made on two devices at once are merged field by field instead of overwriting each other. The app also opens offline, can be installed as a PWA and has a light and a dark theme.

## Privacy

Sign in with email and password or a magic link (the address has to be confirmed). Your data is stored on the server under your account; the browser only keeps a cache. The calendar subscription link is read-only, and you can rotate or turn it off any time in Settings. Deleting your account deletes all your data. You can also download an `.ics` file without a subscription. The full privacy notice is at `/adatvedelem`.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
npm test        # node:test, TZ=UTC, with real iCal fixtures (fixtures/ical)
```

Next.js (App Router), React, Tailwind CSS v4, zustand, ical.js, date-fns, lucide-react. Project conventions (structure, design tokens, iCal rules) are in [`CLAUDE.md`](CLAUDE.md), the roadmap in [`docs/PLAN.md`](docs/PLAN.md).

### Layout

| Path | Contents |
| --- | --- |
| `app/` | Pages (`/`, `/targy/[id]`, `/radar`, `/beallitasok`, `/belepes`, `/adatvedelem`) and API routes |
| `app/api/fiok`, `app/api/adatok` | Accounts and syncing the per-user data document |
| `app/api/ical` | CORS proxy for iCal feeds (with SSRF protection) |
| `app/api/naptar` | The public `.ics` endpoint |
| `app/api/hirlevel`, `app/api/cron` | Email digest: unsubscribe and the daily cron |
| `components/` | UI; `components/ui/` holds the primitives, `components/settings/` the settings sections |
| `lib/` | Pure logic: radar, search, quick-add, iCal parsing and export, dedupe, sync |
| `app/tokens.css` | Design tokens of the "Hirdetőtábla" (notice board) theme, light and dark |

### Deployment

Accounts, data and the merged calendar (`/api/naptar/<token>`) need server-side storage (Upstash Redis), and sign-up and sign-in emails need Resend. On Vercel: Project → Storage → add Upstash Redis. Either pair of variables works:

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

In development (`npm run dev`) none of these are needed: an in-memory store is used. In production the endpoints return 503 without them.

### Email (sign-in and digest)

The digest is opt-in under Settings → Notifications: daily, weekly (Monday) or monthly (the 1st), sent to the account's confirmed address with an unsubscribe link. It is triggered by the daily cron in `vercel.json` (`/api/cron/hirlevel`, 04:00 UTC). Variables:

- `RESEND_API_KEY`: [Resend](https://resend.com) API key;
- `DIGEST_FROM`: sender on a domain verified in Resend, e.g. `Hallgatói réteg <hirlevel@example.hu>`;
- `CRON_SECRET`: sent by Vercel with the cron (`Authorization: Bearer …`), required in production;
- `APP_URL` (optional): base URL for links in emails; defaults to `VERCEL_PROJECT_PRODUCTION_URL`.

Without a key in development, emails are written to the server log, and the cron can be called by hand: `curl localhost:3000/api/cron/hirlevel`.

## License

MIT, see [LICENSE](LICENSE).

---

<a id="magyar"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-header-dark.svg">
  <img src="docs/brand/readme-header-light.svg" alt="Hallgatói réteg – minden tárgyad, határidőd és órád egy helyen" width="100%">
</picture>

Az órarend a Neptunban van, a beadandók a Canvasban, a tárgyak fele Moodle-ön, a többi meg valahol Teamsen vagy Discordon. A **Hallgatói réteg** ezek fölé kerül: egy helyen látod minden tárgyad linkjeit, anyagait és határidőit, ráadásul kapsz egy **közös naptárt** is, amit egy linkkel hozzáadhatsz az Apple vagy a Google Naptárhoz.

Élő oldal: <https://hallgatoui.vercel.app>

## Mit tud?

### Tárgyak
Minden tárgynak külön oldala van: itt vannak a linkjei (Neptun, Canvas, Teams, Moodle, vagy bármi, amit te veszel fel), az anyagai (jegyzet, régi ZH, megoldás, videó), a határidői és a heti órái. Nem kell többé öt helyen keresgélni.

### Naptár-import
Elég megadni a Canvas, a Moodle vagy bármilyen más iCal feed linkjét, a határidők maguktól a megfelelő tárgyhoz kerülnek. Ha a feedben olyan Canvas-kurzus van, ami még nincs meg, tárgyat is csinálhatsz belőle, a Canvas-linkje pedig automatikusan bekerül. Ha félév közben kötöd be, a már lejárt határidőket egy pipával kipipálhatod. A feedek a háttérben frissülnek, a pipáid és a kritikus jelöléseid közben nem vesznek el.

### Órarend-import
A Neptunból exportált órarendet (Naptár → Exportálás) linkként vagy `.ics` fájlként is behúzhatod; a fájlt a böngésző olvassa be, nem megy fel sehova. A Neptunos tantárgyneveket egyszer kell párosítani a tárgyaiddal, ezt az app megjegyzi, újraimportálás után sem kell újra megcsinálni. Utána az órák megjelennek a heti nézetben, a tárgy oldalán és a naptárban is. Csak az aktuális héttől importál, a múlt félév órái nem keverednek bele.

### Határidő-radar
Hetekre bontva, sürgősség szerint látod, mi vár rád: mi járt le, mi kritikus (48 órán belül esedékes, vagy te jelölted meg), mi jön egy héten belül, és mi ráér. Hetente összesítőt is kapsz. A feedből jövő határidőket nem lehet szerkeszteni, csak késznek vagy kritikusnak jelölni, így mindig az van ott, ami a forrásban.

### Közös naptár-előfizetés
Egyetlen `.ics` link, benne minden forrással és a saját határidőiddel. A szerver mindig a fiókod aktuális adataiból rakja össze, így amit átírsz, az azonnal látszik:
- ami kész, az kimarad; a kritikusak 🔴 jelet és emlékeztetőt kapnak (előtte 1 nappal és 1 órával);
- **nézetek**: minden, csak a kritikusak, ZH-k, órarend vagy egyetlen tárgy (`?nezet=…`), úgyhogy minden tárgyra külön, saját színnel is feliratkozhatsz;
- hétfőnként **📋 Heti radar** összefoglaló, a kritikus határidők előtti két napon pedig **📚 Készülés** blokk;
- ha egy forrásban elcsúszik egy határidő, 48 óráig **(módosult)** címkét kap;
- a forrásfeedeket a szerver is frissíti, és szól, ha valamelyik több mint 24 órája nem érhető el.

### Duplikátumok
Ha ugyanazt a ZH-t a Canvas, a Moodle és a Neptun is kiírja, csak egyszer jelenik meg, „+N forrás” jelöléssel. Ha két különböző dolgot vont össze, a „Nem duplikátum” gombbal szétszedheted. Az appban és a naptárban is működik, és ki is kapcsolható.

### Határidők felvétele
Felvehetsz egyszeri határidőt, egyszerre több időpontot vagy ismétlődő sorozatot (például heti kvízeket, amiket automatikusan megszámoz). Ha gyorsan kell, a `Ctrl K` / `⌘K` megnyitja a keresőt, ahová egy sorban is beírhatod: az `analízis zh péntek 10:00 !` például péntek 10:00-ra felvesz egy kritikus határidőt az Analízis tárgyhoz. A keresésnél az ékezet nem számít.

### Emlékeztetők
- A fejlécben lévő csengőnél látod, mi járt le, mi kritikus és mi jön hamarosan.
- Amíg nyitva van egy lap, a böngésző értesít a közelgő határidőkről.
- Kérhetsz **e-mailes összefoglalót** is (naponta, hetente vagy havonta) a fiókod címére. A napi levél csak akkor jön, ha aznap vagy másnap van valami, és benne vannak a napi óráid is.

### Mindenhol ugyanaz
Az adataid a fiókodhoz tartoznak, így a laptopon és a telefonon is ugyanazt látod. Ha két eszközön egyszerre szerkesztesz, a módosítások nem írják felül egymást, az app összefésüli őket. Netkapcsolat nélkül is megnyílik, telepítheted alkalmazásként (PWA), és van világos és sötét témája.

## Adatvédelem

Belépni e-mail-címmel és jelszóval vagy belépő linkkel lehet, a címet előbb meg kell erősíteni. Az adataid a szerveren, a fiókodhoz kötve vannak tárolva, a böngésző csak egy helyi másolatot tart. A naptár-előfizetési linkkel csak olvasni lehet, és a Beállításokban bármikor lecserélheted vagy kikapcsolhatod. Ha törlöd a fiókodat, minden adatod vele együtt törlődik. Ha nem akarsz előfizetni, a naptárat `.ics` fájlként is letöltheted. A teljes adatkezelési tájékoztató az `/adatvedelem` oldalon van.

## Fejlesztés

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
npm test        # node:test, TZ=UTC, valódi iCal-mintafájlokkal (fixtures/ical)
```

Next.js (App Router), React, Tailwind CSS v4, zustand, ical.js, date-fns, lucide-react. A projekt szabályai (mappaszerkezet, design-tokenek, iCal) a [`CLAUDE.md`](CLAUDE.md)-ben vannak, a tervek és a következő lépések a [`docs/PLAN.md`](docs/PLAN.md)-ben.

### Mappaszerkezet

| Hely | Mi van benne |
| --- | --- |
| `app/` | Oldalak (`/`, `/targy/[id]`, `/radar`, `/beallitasok`, `/belepes`, `/adatvedelem`) és API-végpontok |
| `app/api/fiok`, `app/api/adatok` | Fiókok, és a felhasználók adatainak szinkronizálása |
| `app/api/ical` | CORS-proxy az iCal feedekhez (SSRF elleni védelemmel) |
| `app/api/naptar` | A nyilvános `.ics` végpont |
| `app/api/hirlevel`, `app/api/cron` | E-mailes összefoglaló: leiratkozás és a napi cron |
| `components/` | Felület; `components/ui/` az alapelemek, `components/settings/` a beállítások részei |
| `lib/` | Tiszta logika: radar, keresés, gyors felvétel, iCal beolvasás és export, duplikátumszűrés, szinkron |
| `app/tokens.css` | A „Hirdetőtábla” téma design-tokenjei, világos és sötét változatban |

### Élesítés

A fiókokhoz, az adatokhoz és a közös naptárhoz (`/api/naptar/<token>`) szerveroldali tárhely kell (Upstash Redis), a regisztrációs és belépő levelekhez pedig Resend. Vercelen: Project → Storage → Upstash Redis. Az alábbi két változópár közül bármelyik jó:

- `UPSTASH_REDIS_REST_URL` és `UPSTASH_REDIS_REST_TOKEN`, vagy
- `KV_REST_API_URL` és `KV_REST_API_TOKEN`.

Fejlesztés közben (`npm run dev`) egyik sem kell, ilyenkor minden a memóriában van. Élesben ezek nélkül a végpontok 503-as hibát adnak.

### E-mail (belépés és összefoglaló)

Az összefoglalót a Beállítások → Értesítések alatt lehet bekapcsolni: naponta, hetente (hétfőn) vagy havonta (1-jén) megy ki a fiók megerősített címére, leiratkozó linkkel. A küldést a `vercel.json`-ban beállított napi cron indítja (`/api/cron/hirlevel`, 04:00 UTC). Környezeti változók:

- `RESEND_API_KEY`: [Resend](https://resend.com) API-kulcs;
- `DIGEST_FROM`: a feladó, egy Resendben ellenőrzött domainről, pl. `Hallgatói réteg <hirlevel@example.hu>`;
- `CRON_SECRET`: ezt küldi a Vercel a cronnal (`Authorization: Bearer …`), élesben kötelező;
- `APP_URL` (nem kötelező): a levelekben lévő linkek alapcíme; ha nincs megadva, a `VERCEL_PROJECT_PRODUCTION_URL`.

Fejlesztés közben, API-kulcs nélkül a levelek a szerver naplójába kerülnek, a cront pedig kézzel is meghívhatod: `curl localhost:3000/api/cron/hirlevel`.

## Licenc

MIT, lásd a [LICENSE](LICENSE) fájlt.
