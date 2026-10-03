# Hallgatói réteg

Egy réteg az egyetemi rendszerek (Neptun, Canvas, Moodle, Teams, TMS, Discord…) fölött: minden tárgyad linkjei, anyagai és határidői egy helyen, plusz **egyetlen összefésült naptár**, amire Apple és Google Naptárból is fel tudsz iratkozni.

Élő oldal: <https://hallgatoui.vercel.app>

## Mit tud?

- **Tárgyak** – tárgyanként a platformlinkek (Neptun, Canvas, Teams…), anyagok (jegyzet, ZH, megoldás, videó) és határidők.
- **Naptár-import** – Canvas, Moodle (és bármilyen iCal) feed hozzáadása. A határidők automatikusan a megfelelő tárgyhoz kerülnek, a Canvas-kurzusokból tárgyak is létrehozhatók. Hozzáadáskor a már lejárt határidők egy pipával késznek jelölhetők.
- **Határidő-radar** – hetekre bontva, sürgősség szerint, kritikus jelöléssel és heti összesítővel.
- **Összefésült naptár-előfizetés** – egy `.ics` link, ami minden forrást és a saját határidőidet is tartalmazza:
  - a kész elemek kimaradnak, a kritikusak 🔴 jelet és emlékeztetőt (1 nap és 1 óra előtte) kapnak;
  - **nézetek**: minden / csak kritikus / ZH-k / egy tárgy (`?nezet=…`), így tárgyanként külön színnel is feliratkozhatsz;
  - hétfőnként **📋 Heti radar** összesítő, a kritikus határidők előtti két napon **📚 Készülés** blokk;
  - ha egy forrás áthelyez egy határidőt, 48 óráig **(módosult)** jelzést kap;
  - a szerver magától is frissíti a forrásfeedeket, és szól, ha valamelyik több mint 24 órája nem elérhető.
- **Keresés és gyors felvétel** – `Ctrl K`, ékezetfüggetlen keresés.
- **Értesítések** – böngészőértesítés a közelgő határidőkről, amíg nyitva van egy lap.

## Adatvédelem

Nincs fiók és nincs bejelentkezés: minden adat a böngésződben (localStorage) marad. Kivétel a naptár-előfizetés, ha bekapcsolod: ekkor a tárgyaid és határidőid egy pillanatképe a szerverre kerül, hogy a naptáralkalmazásod le tudja kérni. A feliratkozási link csak olvasni enged; módosítani csak a böngésződben tárolt titkos kulccsal lehet. Az előfizetés bármikor törölhető a Beállításokban. A `.ics` letöltés szerver nélkül is működik.

## Fejlesztés

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
```

Next.js (App Router), React, Tailwind CSS v4, zustand, ical.js, lucide-react. A projekt konvenciói (mappaszerkezet, design-tokenek, iCal-szabályok) a [`CLAUDE.md`](CLAUDE.md)-ben vannak.

### Felépítés

| Hely | Tartalom |
| --- | --- |
| `app/` | Oldalak (`/`, `/targy/[id]`, `/radar`, `/beallitasok`) és API-útvonalak |
| `app/api/ical` | CORS-proxy az iCal feedekhez (SSRF-védelemmel) |
| `app/api/naptar` | A naptár-előfizetés végpontjai |
| `components/` | UI; `components/ui/` az alapelemek, `components/settings/` a beállítások szekciói |
| `lib/` | Tiszta logika: store, radar, keresés, iCal-feldolgozás és -export |
| `app/tokens.css` | Design-tokenek („night blueprint” sötét téma, Fira Code) |

## Naptár-előfizetés / deployment

Az összefésült naptár (`/api/naptar/<token>.ics`) szerveroldali tárolást igényel (Upstash Redis). Vercelen: Project → Storage → Upstash Redis hozzáadása. Környezeti változók (a Marketplace bármelyik párt beállíthatja):

- `UPSTASH_REDIS_REST_URL` és `UPSTASH_REDIS_REST_TOKEN`, vagy
- `KV_REST_API_URL` és `KV_REST_API_TOKEN`.

Fejlesztésben (`npm run dev`) nincs szükség rájuk: memóriabeli tároló működik. Éles környezetben, ha hiányoznak, a végpontok 503-at adnak.
