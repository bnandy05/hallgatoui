# Adatkezelési nyilvántartás (GDPR 30. cikk (1))

Utolsó frissítés: 2026-10-12

> Belső dokumentum, a felügyeleti hatóság (NAIH) kérésére bemutatható. Az `/adatvedelem` oldal szövegével (`lib/privacy.ts`, magyar változat) és a tényekkel (`lib/legal.ts`) egyeznie kell: a tájékoztató minden módosításakor ezt is frissíteni kell, és a fenti dátumot átírni.

## Az adatkezelő

- Név: Bere Nándor (magánszemély), a Hallgatói réteg szolgáltatás üzemeltetője.
- Elérhetőség (adatvédelmi kérések): berenandor@icloud.com
- Közös adatkezelő, adatvédelmi tisztviselő: nincs.
- Az adatkezelés nem az egyetemek, a Neptun, a Canvas vagy a Moodle megbízásából történik; azoktól a szolgáltatás nem kap adatot, csak azt látja, amit a felhasználó megad, vagy amit a megadott naptár-hivatkozások tartalmaznak.
- Felhasználók: csak 18. életévét betöltött személy regisztrálhat.

## Adatkezelési tevékenységek

Közös jellemzők, ha a tevékenységnél más nincs jelölve:

- Érintettek: a szolgáltatás regisztrált felhasználói.
- Adatfeldolgozók: Vercel Inc. (tárhely, kiszolgálás), Upstash, Inc. (adatbázis, Frankfurt, EU).
- Harmadik országba továbbítás: a Vercel és az Upstash amerikai cégek; az adattovábbítás az EU–USA adatvédelmi keretrendszerről (DPF) szóló megfelelőségi határozaton vagy az Európai Bizottság általános szerződési feltételein (SCC) alapul. A szerveroldali feldolgozás Frankfurtban (EU) történik, a Vercel a kérések rendszernaplóit legfeljebb 1 óráig őrzi.

| Tevékenység | Adatkategóriák | Jogalap | Megőrzés / törlés |
| --- | --- | --- | --- |
| Fiók | Email cím, a jelszó scrypt-lenyomata, a regisztráció és a megerősítés ideje | Szerződés teljesítése (6. cikk (1) b)) | A fiók törléséig; a meg nem erősített regisztráció 7 nap után automatikusan törlődik |
| Nyelvbeállítás | Választott nyelv (hu/en), és hogy a felhasználó választotta-e ki | Szerződés teljesítése (6. cikk (1) b)) | A fiók törléséig |
| Bejelentkezés | Munkamenet-azonosító (csak lenyomatként), létrehozás és utolsó használat ideje, user agent (legfeljebb 200 karakter), az emailben küldött egyszer használatos linkek lenyomata | Szerződés teljesítése (6. cikk (1) b)) | Munkamenet: kilépéskor vagy 90 nap használaton kívül; linkek: 30 perc (belépés, jelszó) vagy 48 óra (megerősítés, címváltás) |
| Tanulmányi adatok | Tárgyak, linkek, határidők, órarend, megadott naptár-hivatkozások (Canvas, Moodle, Neptun iCal link; hozzáférési kulcsnak minősülnek) | Szerződés teljesítése (6. cikk (1) b)) | A fiók törléséig vagy a felhasználó általi törlésig; a letöltött és előállított naptárak átmeneti másolata 15 percig |
| Naptár feliratkozási link | Véletlen azonosító (token), amellyel a határidők (a tárgyak linkjei nélkül) lekérhetők | Szerződés teljesítése (6. cikk (1) b)) | Kikapcsolásig, a link cseréjéig vagy a fiók törléséig |
| Email-összefoglaló | Gyakoriság, leiratkozási kulcs, utolsó küldés ideje; a levél a fiók email címére megy | Hozzájárulás (6. cikk (1) a)), bármikor visszavonható | Leiratkozásig vagy a fiók törléséig |
| Visszaélés elleni védelem | IP-cím, belépési/regisztrációs/levélküldési kísérletek számlálásához; az email címek a számlálókban csak lenyomatként | Jogos érdek (6. cikk (1) f)): a fiókok védelme jelszópróbálgatás és tömeges levélküldés ellen | Legfeljebb 1 óra |

### Az email-küldést érintő eltérések

Az emailek kézbesítésénél (megerősítő, belépő, jelszó- és címváltó levelek, valamint az összefoglaló) harmadik adatfeldolgozó is részt vesz: Plus Five Five, Inc. (Resend). Kezelt adat: az email cím és a levél tartalma. A levelek az EU-ból (Írország) mennek ki; a kézbesítési adatokat és naplókat a Resend az Egyesült Államokban, legfeljebb 30 napig őrzi. Az amerikai továbbítás jogalapja a DPF megfelelőségi határozat vagy az SCC. A Resend a fenti tevékenységek közül a Fiók, a Bejelentkezés és az Email-összefoglaló levélküldéséhez kapcsolódik.

### Egyéb megjegyzések

- Naptár-letöltés: a felhasználó által megadott naptár-hivatkozásról a szerver tölti le a naptárat (az egyetem vagy a platform szerveréről); ehhez a kéréshez felhasználói adat nem megy el.
- Sütik: `hr_session` (munkamenet, kilépésig vagy 90 napig), `hr_lang` (nyelv, 1 év, azonosítót nem hordoz), `hr_demo` (bemutató jelzése, böngésző bezárásáig). Mind a kért szolgáltatáshoz szükséges, hozzájárulást nem igényel. Elemző, követő, hirdetési süti nincs.
- Helyi tárolás és gyorsítótár (service worker): a böngésző a fiók adatainak helyi másolatát és az oldalak másolatát tartja; kilépéskor és fióktörléskor ezeket töröljük. A fiókadatokat szállító API-válaszok nem kerülnek a gyorsítótárba.
- Profilalkotás, automatizált döntéshozatal, hirdetés, elemzés nincs; az adatokat nem adjuk el és nem adjuk át harmadik félnek, csak a fenti adatfeldolgozóknak.
- Az érintetti jogok (hozzáférés, adathordozhatóság JSON-exporttal, helyesbítés, törlés, tiltakozás, korlátozás, hozzájárulás visszavonása): a tájékoztató „Jogaid" szakasza szerint; kérelmekre egy hónapon belül válaszolunk. A fióktörlés azonnal és véglegesen töröl minden fiókhoz tartozó adatot; a tárhelyszolgáltató biztonsági mentéseiből a másolat a mentések lejártával tűnik el.
- Adatfeldolgozói szerződések (DPA): mindhárom szolgáltatóval fennállnak (lásd `docs/PLAN.md`, tulajdonosi teendők: a szerződések elfogadása és az egyes szolgáltatók beállításainak ellenőrzése).

## Technikai és szervezési biztonsági intézkedések

- Jelszavak: scrypt-lenyomatként tárolva (`lib/server/auth/password.ts`).
- Munkamenet-, belépő- és megerősítő tokenek: csak sha256-lenyomatként tárolva (`lib/server/auth/tokens.ts`); egyszer használatosak és lejárnak.
- Munkamenet-süti: `HttpOnly; SameSite=Lax`, éles környezetben `Secure` (`lib/server/auth/http.ts`).
- CSRF-védelem: a módosító útvonalak ellenőrzik az `Origin` fejlécet (`checkOrigin`).
- Korlátozások: belépés, regisztráció és levélküldés próbálkozásainak korlátozása (`rl:<művelet>:<azonosító>` számlálók, az email címek lenyomatként); a naptár-proxy (`/api/ical`) munkamenetet és azonos eredetű kérést igényel, felhasználónként 60 kérés / 10 perc.
- Átvitel: HTTPS, HSTS (`Strict-Transport-Security`), `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, részleges CSP (`next.config.ts`).
- Naptár-letöltés védelme (SSRF): minden URL és minden átirányítás átmegy az `assertPublicUrl` ellenőrzésen (`lib/ical/ssrf.ts`).
- Tárolás: az adatbázis az EU-ban (Frankfurt) van; a szerverfüggvények Frankfurtban futnak (`vercel.json`, `fra1`).
- Adattakarékosság: elemzés, követés, profilalkotás nincs; a naptár-feliratkozásban a tárgyak linkjei nem szerepelnek; a levélküldési hibanapló nem tartalmazza a levél tartalmát.
- Törlés: a fiók törlése azonnal töröl minden hozzá tartozó rekordot; a meg nem erősített regisztráció 7 nap után lejár.
- Incidenskezelés: lásd `docs/legal/incidensek.md`.
