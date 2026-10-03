# Roadmap

The working plan for Hallgatói réteg. It lives in the repo so every session (human or agent) starts from the same list. Update it when something ships or the plan changes.

Conventions for all work: see [`CLAUDE.md`](../CLAUDE.md). The process: an agent writes a brief, a subagent implements it, the agent reviews it and pushes to a `claude/*` branch, and the owner tests the Vercel preview and merges. The sandbox can't reach `*.vercel.app`, so testing on the deployed site is always the owner's job.

## Done (in `main`)

- **Merged calendar subscription**:
  - one `.ics` link (`/api/naptar/<token>.ics`) for Apple and Google Calendar, backed by Upstash Redis;
  - the server re-fetches the source feeds every 15 minutes;
  - a warning event appears when a feed has been failing for more than 24 hours.
- **Calendar extras**:
  - views (`?nezet=osszes|kritikus|zh|targy-<id>`);
  - a Monday "📋 Heti radar" event;
  - "📚 Készülés" study blocks before critical deadlines;
  - a "(módosult)" marker for 48 hours after a due date moves;
  - past deadlines can be marked done when a feed is added, plus a "Lejártak késznek jelölése" button for existing feeds.
- **"Night blueprint" restyle**:
  - graph-paper background, highlighter-yellow and chalk-mint palette, `TraceField` circuit traces;
  - readability pass: brighter greys, a content scrim, visible borders and button edges.
- **README** rewritten.

## Step 0: real iCal fixtures (owner, on their computer)

Every item below is easier to build and test against real data. Please add the exports you have to `fixtures/ical/` (see [`fixtures/ical/README.md`](../fixtures/ical/README.md) for naming and what to scrub):

| File | Where to get it | Unblocks |
| --- | --- | --- |
| `canvas.ics` | Canvas → Calendar → "Calendar Feed" link, open it, save the file | dedup, regression tests |
| `moodle.ics` | Moodle → Calendar → Export calendar. **ELTE Moodle has export disabled**: produce it with the Plan 6 tool | dedup, regression tests |
| `neptun-orarend.ics` | Neptun → Órarend / Naptár → export (iCal / .ics), if your Neptun offers it | Neptun timetable import |
| `neptun-vizsga.ics` | the same, for exams (Vizsgák), if separate | dedup with Canvas exams |
| anything else (Teams, TMS, Google) | optional | — |

If Neptun has **no** iCal export, note what it does offer (a CSV or Excel timetable export, a printable page, an "add to Google Calendar" button) in the fixtures README. Plan 2 changes accordingly.

## 1. Duplicate removal across sources

**Problem:** the same exam or deadline arrives from several sources (Neptun exam and Canvas assignment, or the Canvas and Moodle copies of the same course), so it appears twice in the radar and the subscribed calendar.

**Approach:**
- A pure `lib/ical/dedupe.ts`: `findDuplicates(deadlines, courses) → DuplicateGroup[]`. Two open deadlines are candidates when:
  - they come from different feeds (or one feed and one manual entry);
  - they resolve to the same course;
  - their due times are within a window (same Budapest day; ±1 hour if both have times);
  - their normalised titles are similar: accent-insensitive via `normalizeSearch`, with course code and boilerplate words ("beadandó", "assignment", "ZH", brackets) stripped, then token overlap ≥ 0.6, or one title contains the other.
- **Display rule:** one primary per group, chosen by source priority (manual > Canvas > Moodle > Neptun > other, tunable), with the others marked `duplicateOf: <primaryId>` (computed, not stored, so it recomputes after every sync).
  - The radar shows the primary with a small "+1 forrás" (one more source) pill that expands to the other sources' links.
  - `buildCalendar` emits only the primary. Its description lists all sources' links.
- **User control:**
  - "Nem duplikátum" ("not a duplicate") on a group, stored as a pair key in `ignoredDuplicatePairs` in `AppData`;
  - marking the primary done or critical applies to the whole group.
- Server side, the same function runs inside `GET /api/naptar/[token]` after `mergeFeedSync`, so phones see the deduped view.
- **Tests:** table-driven cases from the fixtures (same exam in Neptun and Canvas, two similarly named but different assignments that must not merge, and so on).

**Open questions for the owner:**
- Which source should win by default?
- Should dedup be on by default? Suggested: yes, with a toggle in Beállítások → Naptár.

## 2. Neptun timetable import

**Depends on Step 0.** Two paths:

- **(a) Neptun has an iCal export or link.**
  - Treat it as a feed with `platformId: "neptun"`.
  - Add a feed kind so timetable events (classes, recurring) are kept apart from deadlines: a new `ClassSession` type, or `Deadline.kind = "ora"`, decided after seeing the file.
  - Recurring events (`RRULE`, `EXDATE`) need expanding: ical.js supports this, so cap it at the semester.
  - Course matching uses the subject code in the summary (Neptun puts e.g. `BMEVIIIAA01` in the title or description).
  - Discovery reuses `lib/ical/discover.ts`: create courses from Neptun subjects, like Canvas.
  - UI:
    - a weekly timetable view on `/` or a new `/orarend` page ("Órarend");
    - the next class on each course card;
    - classes in the merged calendar as their own view (`?nezet=orarend`), off by default in "összes", because the user's calendar may already have them.
- **(b) No iCal: a file or paste import.**
  - The user uploads the export Neptun does offer (Excel or CSV) or pastes the timetable table.
  - A pure parser creates the same `ClassSession` records, which are static and re-imported each semester.

Either way, Neptun exam dates feed into Plan 1's dedup.

## 3. Shared course feeds (later)

Classmates subscribe to one curated feed per course: a "tárgyfelelős" (course owner) student maintains it, and others subscribe.

Sketch:
- A course can be "published": the server stores a public course snapshot (deadlines and resources only, never personal done or critical state) under a share token.
- Others add it like an iCal feed (`/api/targy/<token>.ics` + JSON); its deadlines merge with `source: "shared"`.
- The owner's write secret works like the subscription secret.
- Moderation and abuse: rate limits like the subscription routes; no free-text pages, only structured data.

This needs an owner decision on privacy wording and on whether this stays accountless.

## 4. Copy: drop the Odyssey theme

The UI copy still uses the Odyssey and ship metaphor:
- "egy fedélzeten", "Még üres a fedélzet", "A te hajód…";
- the Odüsszeusz and sziréna (siren) footnotes;
- the sailboat logo icon.

Rewrite it in the school, notebook and blueprint voice so the site no longer reads as an Odysseus copy. Keep the dry humour in the small footnotes. Small and self-contained; a good next quick win.

## 5. Impeccable design skill

The owner wants [Impeccable](https://github.com/pbakaus/impeccable) (design commands `/impeccable audit`, `polish`, `critique`…).
- The cloud agent may not install it: the permission system blocks skill and hook installs.
- The owner installs it on their computer from the repo root:
  ```bash
  npx impeccable install --providers=claude --scope=project
  ```
- Review what it writes to `.claude/`, especially the hooks, then commit and push so cloud sessions get it.
- First use: `/impeccable init` (writes `PRODUCT.md`), then `/impeccable audit` across `/`, `/radar` and `/beallitasok`.

## 6. ELTE Moodle naptár-export (helyi Python eszköz)

> **Állapot: csak terv.** Nincs implementálva, és hálózati kérés sem fut, amíg a tulajdonos jóvá nem hagyja. Az eszköz **a tulajdonos gépén fut**, a saját bejelentkezett munkamenetével. A felhős sandbox nem kap Moodle-sütit, és nem is futtatja.

### Cél és háttér

A saját ELTE Moodle naptárból (https://moodle.elte.hu) importálható `.ics` fájl készül.
- A Moodle felületén nincs export (valószínűleg ki van kapcsolva az `enablecalendarexport`), ezért a naptároldal saját AJAX-szolgáltatását hívjuk ugyanúgy, ahogy a böngésző.
- A havi HTML-nézetben (`/calendar/view.php?view=month&time=<ts>`) nincs óra és perc, ezért nem HTML-t scrape-elünk.
- Ismert kurzusok: 14258 (Tűz- és munkavédelem), 15823 (Filmklub III), 25748 (Filmklub 2026/27/1). A `courseid=1` a „Minden kurzus” nézet.
- Példaesemény: „Az ötödik pecsét – szombati teszt megnyílik/lezárul” (`mod_quiz`, `open`/`close` típus).

**Nem cél:**
- eseményazonosítók végigpróbálgatása (brute force);
- jelszó vagy SSO-adat kezelése;
- párhuzamos kérések.

### Fájlstruktúra és függőségek

```
tools/moodle-export/
  README.md                 # használat, sesskey és süti megszerzése
  pyproject.toml            # vagy requirements.txt; Python ≥ 3.11
  .env.example              # MOODLE_SESSION=, MOODLE_SESSKEY=, MOODLE_BASE_URL=https://moodle.elte.hu
  moodle_export/
    __init__.py
    config.py               # env és .env beolvasás, titkok maszkolása (redact)
    client.py               # AJAX-hívás, retry, hibaosztályozás (az egyetlen hálózati réteg)
    parse.py                # nyers JSON → MoodleEvent dataclass (tiszta függvény)
    ics.py                  # MoodleEvent lista → .ics bájtok (tiszta függvény)
    cli.py                  # argumentumok, hónapok bejárása, deduplikáció, összegzés
  tests/
    fixtures/monthly_2026_10.json   # a próbahívás kimenete, kitisztítva
    fixtures/action_events.json     # opcionális, a keresztellenőrzéshez
    test_parse.py
    test_ics.py
    test_cli_dedupe.py
  raw/                      # nyers válaszok; gitignore-olva, soha nem kerül commitba
```

- Függőségek:
  - `requests`, `icalendar` (≥ 6), `python-dotenv`;
  - fejlesztéshez `pytest`;
  - időzónához a beépített `zoneinfo` (és Windowson a `tzdata`).
- A Next.js appba nem kerül új függőség: az eszköz külön mappában él, a Vercel nem építi.
- **`.gitignore`:** a mostani `.env*` szabály az `.env.example`-t is kizárja. Ezért kell egy `!.env.example` kivétel, és be kell venni a `tools/moodle-export/raw/` mappát. A `tools/moodle-export/.env` fájlt a meglévő `.env*` szabály már lefedi.

### A kérés

Ugyanaz a kérés, amit a naptároldal küld:

```
POST {BASE}/lib/ajax/service.php?sesskey=<SESSKEY>&info=core_calendar_get_calendar_monthly_view
Cookie: MoodleSession=<SESSION>
Content-Type: application/json
Body: [{"index":0,"methodname":"core_calendar_get_calendar_monthly_view",
        "args":{"year":2026,"month":10,"day":1,"courseid":1,"categoryid":0,
                "includenavigation":false,"mini":false}}]
```

- A válasz egy lista: `[{"error": false, "data": {...}}]` vagy `[{"error": true, "exception": {"errorcode": "...", "message": "..."}}]`.
- Az események a `data.weeks[].days[].events[]` alatt vannak. A várt mezők: `id`, `name`, `timestart`, `timeduration`, `url`/`viewurl`, `eventtype`, `component`/`modulename`, `course` (objektum `id`/`fullname`/`shortname` mezőkkel, vagy hiányzik). **Ez feltételezés**: a pontos szerkezetet az 1. lépés dönti el.
- Keresztellenőrzés: `core_calendar_get_action_events_by_timesort` (`timesortfrom`, `timesortto`, `limitnum` ≤ 50, lapozás `aftereventid`-del). Ez csak a teendős (határidős) eseményeket adja vissza, de egy tartományt egyben.

### Lépések sorrendje

0. **Váz:** a mappa, `.env.example`, `.gitignore`-kivételek, `config.py` titokmaszkolással és a README. Hálózat még nincs.
1. **Próbahívás, egyetlen hónap:** `python -m moodle_export probe --month 2026-10`.
   - Pontosan **egy** kérés megy ki. A nyers JSON a `raw/monthly_2026-10.json` fájlba kerül, változatlanul.
   - A konzolra csak a kulcsfa (mezőnevek és típusok) és az eseményszám kerül ki, értékek nem.
   - A tulajdonos elküldi a kulcsfát, vagy egy kitisztított változatot a fájlból. **A parser ehhez igazodik, nem feltételezésekhez.**
2. **Parser** (`parse.py`) a mentett fixture alapján.
   - Tiszta függvény: `parse_monthly(json) -> list[MoodleEvent]`.
   - A nevekben HTML-entitások lehetnek, ezeket `html.unescape` oldja fel.
   - A hiányzó kurzust („felhasználói” vagy „oldal” esemény) kezelni kell.
   - Az ismeretlen mezők nem okoznak hibát.
3. **ICS-generátor** (`ics.py`), lásd lent.
4. **Tesztek** (pytest, hálózat nélkül), lásd lent.
5. **Teljes futtatás:** `python -m moodle_export --from 2026-09 --to 2027-02`.
   - Havonta egy kérés, köztük `time.sleep(1)`.
   - Deduplikáció `id` alapján, az eredmény a `moodle_elte.ics` fájl, majd jön az összegzés.
6. **Keresztellenőrzés** (opcionális `--verify` kapcsoló): egy `action_events_by_timesort` hívás a teljes tartományra. A teendős események id-halmaza legyen része a havi nézetek halmazának; az eltéréseket a program kiírja.
7. **Integráció az oldallal**, ez külön döntés:
   - a kitisztított `moodle_elte.ics` mehet a `fixtures/ical/moodle.ics` helyére (Step 0);
   - az oldal most csak URL-es feedet tud. Ehhez kell egy „.ics fájl importálása” funkció, amely stabil álfeed-azonosítót használ, így újraimportáláskor a `(feedId, externalUid)` upsert frissít, és nem duplikál.

### Az .ics tartalma

| Mező | Érték | Megjegyzés |
| --- | --- | --- |
| `UID` | `moodle-<eventid>@elte.hu` | stabil, újraimportnál nincs duplikátum |
| `DTSTART` | `timestart` UTC-ben (`...Z`) | a UTC-ben írt időpontnál nincs szükség VTIMEZONE-ra, és DST-hiba sem lehet. A kliens helyi időben (Budapest) jeleníti meg |
| `DTEND` | `timestart + timeduration` | 0 esetén lásd lent |
| `SUMMARY` | `name` (unescape) | |
| `URL` | az esemény linkje (`url` vagy `viewurl`) | |
| `DESCRIPTION` | kurzusnév + eseménytípus (pl. „Filmklub III · kvíz lezárul”) | |
| `CATEGORIES` | kurzus teljes neve | az oldal kurzusillesztése (`lib/ical/match.ts`) a Moodle-feedeknél épp a categories-t nézi |
| `TRANSP` | `TRANSPARENT` | egy határidő ne foglalja a naptárat |
| `X-WR-TIMEZONE` | `Europe/Budapest` | csak tájékoztató |
| `VALARM` | 24 órával előtte, csak `close`/`due` típusnál | `--alarm` / `--no-alarm` kapcsoló, alapból bekapcsolva |

- **0 hosszú esemény:** `DTEND = DTSTART` legyen, ne 15 perc.
  - Indok: a Moodle-esemény egy időpont (megnyílik vagy lezárul), nem egy idősáv. A 15 perc hamis „foglalt” blokkot mutatna, és eltolná a lezárás vizuális végét.
  - A Canvas is így exportálja a határidőket, és a Google, az Apple és az Outlook is megjeleníti.
  - Kerülőút, ha egy kliens rosszul jelenítené meg: `--min-duration 15` kapcsoló.
- **`open` és `close` párok:** két külön esemény marad (ez a Moodle forrás szerkezete). Az oldal később a „megnyílik” típust nem határidőként kezelheti. Ehhez a generátor `X-MOODLE-EVENTTYPE:open|close|due|…` tulajdonságot is kiír.
- Megjelenítéshez (konzolos összegzés, `DESCRIPTION`) a `zoneinfo("Europe/Budapest")` használandó, soha nem a gép helyi ideje.

### CLI

- `--from YYYY-MM --to YYYY-MM` (mindkét végpont benne van).
- Alapértelmezett tartomány az aktuális félév, Budapest-dátum szerint:
  - szeptembertől januárig az őszi félév (`YYYY-09` → `YYYY+1-01`);
  - februártól augusztusig a tavaszi félév (`YYYY-02` → `YYYY-06`).
- `--out moodle_elte.ics`, `--alarm/--no-alarm`, `--min-duration N`, `--verify`, `--save-raw` (minden hónap nyers JSON-ját a `raw/` mappába menti).
- Összegzés, például:
  ```
  2026-10: 7 esemény · 2026-11: 4 · …
  összesen 23 egyedi esemény (5 duplikátum kiszűrve) → moodle_elte.ics
  ```

### Hibakezelés és kockázatok

| Kockázat | Kezelés |
| --- | --- |
| **Lejárt munkamenet** | Az `errorcode` értéke `servicerequireslogin`, `invalidsesskey` vagy `requireloginerror`, **vagy** nem JSON jön vissza (átirányítás a bejelentkezési HTML-oldalra). Ilyenkor azonnal leáll, újrapróbálás nélkül, ezzel az üzenettel: „Lejárt a Moodle-munkamenet: jelentkezz be újra, és frissítsd a MOODLE_SESSION / MOODLE_SESSKEY értékét.” A kilépési kód 2. |
| Átmeneti hiba (5xx, időtúllépés, kapcsolat bontása) | Legfeljebb 2 újrapróbálás exponenciális várakozással (2 s, majd 4 s), utána leáll az addig sikeres hónapok megtartása nélkül, hogy ne legyen félkész fájl. A 4xx (a 429 kivételével) nem kerül újrapróbálásra. |
| Eltérő API-szerkezet vagy verzió | Az 1. lépés a valós válaszhoz igazítja a parsert. Ha egy várt kulcs hiányzik, `SchemaError` jön, és a program a mentett nyers fájl elérési útját írja ki. Ismeretlen `errorcode` esetén a kód kerül kiírásra (a `message` mező is, mert az nem titok). |
| Átfedő hónapok, többnapos események | Deduplikáció `id` alapján, mert egy esemény több napnál és több hónapnézetben is megjelenhet. |
| Időzóna és DST | A `timestart` unix (UTC), az .ics-be UTC kerül. Tesztek a 2026-10-25-i és a 2027-03-28-i óraátállításra. |
| **Titkok kiszivárgása** | A `requests` kivételüzenete tartalmazza a teljes URL-t, benne a `sesskey`-jel. Ezért minden kivétel- és logszöveg átmegy a `config.redact()` függvényen, ami a sesskey és a süti értékét `***`-ra cseréli. A fejlécek soha nem kerülnek kiírásra. A `.env` és a `raw/` gitignore-olva van. |
| Személyes adat a nyers JSON-ban | A `raw/` nincs commitolva. A test-fixture-ből a commit előtt törölni kell a neveket, felhasználói azonosítókat és a sesskey-t tartalmazó URL-eket (a `tests/fixtures/README` leírja). |
| Terhelés és ToS | Csak a saját fiók, sorban, 1 s szünettel, félévenként kb. 6 kérés. |

### Tesztek (pytest, hálózat nélkül)

- `test_parse.py`:
  - a fixture-ből a várt számú esemény jön, helyes mezőkkel;
  - a HTML-entitások feloldódnak;
  - a kurzus nélküli esemény nem okoz hibát;
  - ismeretlen extra mezők esetén sincs hiba;
  - egy `error: true` válaszra a megfelelő kivétel jön (`SessionExpired` vagy `MoodleApiError`).
- `test_ics.py`:
  - az UID formátuma helyes;
  - a DTSTART UTC-ben van;
  - DST-határnál a Budapest-idő helyes;
  - 0-s durationnél `DTEND == DTSTART`, `--min-duration 15` esetén +15 perc;
  - VALARM csak `close`/`due` típusnál és csak bekapcsolt flaggel;
  - az eredmény újraolvasva (`icalendar.Calendar.from_ical`) ugyanazokat az eseményeket adja.
- `test_cli_dedupe.py`:
  - két egymást átfedő hónap fixture-éből nincs duplikált UID;
  - az alapértelmezett félévtartomány helyes szeptemberre, januárra, februárra és júliusra.
- `client.py`: a hibaosztályozás a `requests` mockolásával, a retry-számlálóval és a redact függvénnyel együtt tesztelve.

### Amit a tulajdonosnak kell megadnia

1. **A `MoodleSession` süti:**
   - jelentkezz be a https://moodle.elte.hu oldalra;
   - nyisd meg a DevTools-t (F12), azon belül az **Application** (Chrome) vagy **Storage** (Firefox) fület, majd a Cookies → `https://moodle.elte.hu` bejegyzést;
   - a `MoodleSession` sor **Value** mezőjét kell bemásolni. HttpOnly süti, ezért a konzolból nem olvasható ki.
2. **A `sesskey`**, a két módszer közül bármelyikkel:
   - Console fül, ugyanabban a lapon: `M.cfg.sesskey`;
   - vagy Network fül: nyisd meg a naptárat, és szűrj rá a `service.php` szóra. A kérés URL-jében ott a `sesskey=…`.
3. Mindkettő a `tools/moodle-export/.env` fájlba kerül, chatbe vagy commitba soha. A munkamenet kijelentkezéskor vagy hosszabb inaktivitás után lejár; ilyenkor mindkettőt újra ki kell másolni.
4. Az 1. lépés (próbahívás) után a **kulcsfa-kimenetet** kell elküldeni, vagy egy kitisztított `monthly_2026-10.json` fájlt; ez lesz a teszt-fixture.

## Known limitations / small follow-ups

- On the server, "(módosult)" stays until the site is opened again: the 48-hour window starts from the browser's last sync. Fix: store `dueChangedAt` from the server's own `mergeFeedSync` in a small per-token KV record.
- There are no automated tests yet: logic was verified with ad-hoc scripts. After Step 0, add a minimal test runner (Node's built-in `node:test` via `tsx` or similar, which needs owner approval for a dev dependency) with fixture-based tests for `parseIcs`, `mergeFeedSync`, `buildCalendar` and dedup.
- `/targy/[id]` hasn't been screenshot-checked since the restyle.

## Suggested order

1. Step 0 (owner adds the fixtures).
2. Plan 4 (copy rewrite) while the fixtures are being collected.
3. Plan 6 (ELTE Moodle export tool) once the owner approves; its output is the Moodle fixture.
4. Plan 1 (dedup) with fixture tests.
5. Plan 2 (Neptun), path (a) or (b) depending on the export.
6. The "(módosult)" server fix and the test runner.
7. Plan 3 (shared feeds) after an owner decision.
