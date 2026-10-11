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

---

<a id="magyar"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-header-dark.svg">
  <img src="docs/brand/readme-header-light.svg" alt="Hallgatói réteg – minden tárgyad, határidőd és órád egy helyen" width="100%">
</picture>

Órarend a Neptunban, beadandók a Canvasban, a tárgyak másik fele Moodle-ön, közben Teams és Discord. A **Hallgatói réteg** mindezek fölött ül: minden tárgyad linkjei, anyagai és határidői egy táblán, plusz **egyetlen összefésült naptár**, amire Apple és Google Naptárból is feliratkozhatsz.

Élő oldal: <https://hallgatoireteg.hu>

## Mit tud?

### Tárgyak
Minden tárgynak saját oldala van a platformlinkekkel (Neptun, Canvas, Teams, Moodle vagy bármilyen saját platform), az anyagokkal (jegyzet, ZH, megoldás, videó), a határidőkkel és a heti órákkal. Egy kattintással ott vagy, ahol lenned kell.

### Naptár-import
Adj hozzá egy Canvas, Moodle vagy bármilyen iCal feedet, és a határidők automatikusan a megfelelő tárgyhoz kerülnek. A feedben talált Canvas-kurzusokból tárgy is létrehozható, a Canvas-linkjük pedig magától felkerül. Ha félév közben kötsz be egy feedet, a már lejárt határidők egy lépésben késznek jelölhetők. A feedek a háttérben frissülnek, a saját pipáid és jelöléseid minden szinkron után megmaradnak.

### Órarend-import
A Neptunból exportált órarendet (Naptár → Exportálás) linkként vagy `.ics` fájlként importálhatod; a fájl a böngésződben dolgozódik fel. A tantárgyakat egyszer rendeled hozzá a tárgyaidhoz, ez újraimportálás után is megmarad. Az órák ezután a heti nézetben, a tárgy oldalán és a naptár-előfizetésben is megjelennek. Csak az aktuális héttől kezdve importálunk, így a múlt félév nem zavar be.

### Határidő-radar
Hetekre bontva, sürgősség szerint: lejárt, kritikus (48 órán belül vagy általad megjelölve), egy héten belül, később. Heti összesítővel. A feedből érkező határidők nem szerkeszthetők, csak késznek vagy kritikusnak jelölhetők, így a tábla mindig a forrást tükrözi.

### Összefésült naptár-előfizetés
Egyetlen `.ics` link minden forrással és a saját határidőiddel. A szerver a fiókodból állítja elő, így a módosítások azonnal látszanak:
- a kész elemek kimaradnak, a kritikusak 🔴 jelet és emlékeztetőt kapnak (1 nappal és 1 órával előtte);
- **nézetek**: minden, csak kritikus, ZH-k, órarend vagy egy tárgy (`?nezet=…`), így tárgyanként külön színnel is feliratkozhatsz;
- hétfőnként **📋 Heti radar** összesítő, a kritikus határidők előtti két napon **📚 Készülés** blokk;
- ha egy forrás áthelyez egy határidőt, 48 óráig **(módosult)** jelzést kap;
- a szerver maga frissíti a forrásfeedeket, és szól, ha valamelyik több mint 24 órája nem érhető el.

### Duplikátumok összevonása
Ugyanaz a ZH a Canvasban, a Moodle-ön és a Neptunban is: egyszer látszik, „+N forrás” jelzéssel. Ha tévesen vont össze kettőt, a „Nem duplikátum” gombbal kivételt tehetsz. Az alkalmazásban és a naptárban is érvényes, kikapcsolható.

### Határidők felvétele
Egyszeri határidő, több időpont egyszerre vagy ismétlődő sorozat (pl. heti kvízek, automatikus sorszámmal). Gyors rögzítéshez a `Ctrl K` / `⌘K` keresőt és gyorsfelvételt nyit, amely érti a magyar dátumokat és a tárgyneveket: az `analízis zh péntek 10:00 !` például kritikus határidőt vesz fel az Analízis tárgyhoz péntek 10:00-ra. A keresés ékezetfüggetlen.

### Emlékeztetők
- A fejléc csengője mutatja, mi járt le, mi kritikus és mi jön hamarosan.
- Böngészőértesítés a közelgő határidőkről, amíg nyitva van egy lap.
- Opcionális **e-mail-összefoglaló** (napi, heti vagy havi) a fiókod címére. A napi levél csak akkor megy ki, ha aznap vagy másnap van határidő, és a napi órákat is felsorolja.

### Bármelyik eszközön
Az adataid a fiókodhoz tartoznak, és minden eszközön szinkronban vannak. Ha két eszközön egyszerre módosítasz, a változások mezőnként fésülődnek össze, nem írják felül egymást. Az alkalmazás offline is megnyílik, telepíthető (PWA), és van világos és sötét témája.

## Adatvédelem

Belépés e-mail-címmel és jelszóval vagy belépő linkkel (a címet meg kell erősíteni). Az adataid a szerveren, a fiókodhoz kötve tárolódnak, a böngésző csak gyorsítótárat tart. A naptár-előfizetési link csak olvasni enged, és a Beállításokban bármikor lecserélhető vagy kikapcsolható. A fiók törlésekor minden adatod törlődik. Előfizetés nélkül `.ics` fájlként is letöltheted a naptárat. A teljes adatkezelési tájékoztató az `/adatvedelem` oldalon olvasható.

## Fejlesztés

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
npm test        # node:test, TZ=UTC, valódi iCal-fixture-ökkel (fixtures/ical)
```

Next.js (App Router), React, Tailwind CSS v4, zustand, ical.js, date-fns, lucide-react. A projekt konvenciói (felépítés, design-tokenek, iCal-szabályok) a [`CLAUDE.md`](CLAUDE.md)-ben, az ütemterv a [`docs/PLAN.md`](docs/PLAN.md)-ben található.

### Felépítés

| Hely | Tartalom |
| --- | --- |
| `app/` | Oldalak (`/`, `/targy/[id]`, `/radar`, `/beallitasok`, `/belepes`, `/adatvedelem`) és API-útvonalak |
| `app/api/fiok`, `app/api/adatok` | Fiókkezelés és a felhasználónkénti adatdokumentum szinkronja |
| `app/api/ical` | CORS-proxy az iCal feedekhez (SSRF-védelemmel) |
| `app/api/naptar` | A nyilvános `.ics` végpont |
| `app/api/hirlevel`, `app/api/cron` | E-mail-összefoglaló: leiratkozás és a napi cron |
| `components/` | UI; `components/ui/` az alapelemek, `components/settings/` a beállítások szekciói |
| `lib/` | Tiszta logika: radar, keresés, gyorsfelvétel, iCal-feldolgozás és -export, duplikátumszűrés, szinkron |
| `app/tokens.css` | A „Hirdetőtábla” téma design-tokenjei, világos és sötét változatban |

### Telepítés

A fiókokhoz, az adatokhoz és az összefésült naptárhoz (`/api/naptar/<token>`) szerveroldali tároló kell (Upstash Redis), a regisztrációs és belépő levelekhez pedig Resend. Vercelen: Project → Storage → Upstash Redis hozzáadása. Bármelyik változópár megfelel:

- `UPSTASH_REDIS_REST_URL` és `UPSTASH_REDIS_REST_TOKEN`, vagy
- `KV_REST_API_URL` és `KV_REST_API_TOKEN`.

Fejlesztésben (`npm run dev`) egyik sem kell, memóriabeli tároló működik. Éles környezetben nélkülük a végpontok 503-at adnak.

### E-mail (belépés és összefoglaló)

Az összefoglaló a Beállítások → Értesítések alatt kapcsolható be: napi, heti (hétfő) vagy havi (1-je) levél a fiók megerősített címére, leiratkozó linkkel. A küldést a `vercel.json` napi cronja indítja (`/api/cron/hirlevel`, 04:00 UTC). Környezeti változók:

- `RESEND_API_KEY`: [Resend](https://resend.com) API-kulcs;
- `DIGEST_FROM`: feladó egy Resendben ellenőrzött domainről, pl. `Hallgatói réteg <hirlevel@example.hu>`;
- `CRON_SECRET`: a Vercel ezt küldi a cronnal (`Authorization: Bearer …`), élesben kötelező;
- `APP_URL` (nem kötelező): a levelekben szereplő linkek alapcíme; alapértelmezés: `VERCEL_PROJECT_PRODUCTION_URL`.

Fejlesztésben kulcs nélkül a levelek a szerver naplójába kerülnek, a cron pedig kézzel is hívható: `curl localhost:3000/api/cron/hirlevel`.
