// Ready-made rules for four real ELTE courses (schema.md §2), used as templates and as the engine's
// test fixtures. Ids follow RULE_ID_RE, and one namespace is shared by components, retakes,
// derived values, tables and outcomes.

import type { AssignmentOutcome, Scale, SubjectRules } from "./types";

const B_OUTCOMES: AssignmentOutcome[] = [
  { id: "ok", label: "Határidőre elfogadva", points: 3, accepted: true },
  { id: "javitott", label: "Javítás után elfogadva", points: 1, accepted: true },
  { id: "elutasitva", label: "Nem fogadták el", points: 0, accepted: false },
];

const dotnet: SubjectRules = {
  schemaVersion: 1,
  components: [
    { id: "b1", label: "1. beadandó", kind: "assignment", outcomes: B_OUTCOMES },
    { id: "b2", label: "2. beadandó", kind: "assignment", outcomes: B_OUTCOMES },
    { id: "gy1", label: "1. gyakorlati zh", kind: "exam", scale: { kind: "grade", passAt: 2 } },
    { id: "gy2", label: "2. gyakorlati zh", kind: "exam", scale: { kind: "grade", passAt: 2 } },
    { id: "elm", label: "Elméleti zh (30 kérdés)", kind: "exam", scale: { kind: "points", max: 30, passAt: 18 } },
  ],
  retakes: [
    { id: "gyjav", label: "Gyakorlati javító zh", targets: ["gy1", "gy2"], pick: "choose", mode: "replace" },
    { id: "elmjav", label: "Elméleti javító zh", targets: ["elm"], pick: "choose", mode: "replace" },
  ],
  tables: [
    { id: "elmtabla", rows: [{ min: 0, value: 1 }, { min: 18, value: 2 }, { min: 21, value: 3 }, { min: 24, value: 4 }, { min: 27, value: 5 }] },
    { id: "jegy", rows: [{ min: 0, value: 1 }, { min: 12, value: 2 }, { min: 17, value: 3 }, { min: 21, value: 4 }, { min: 26, value: 5 }] },
  ],
  derived: [
    { id: "elmjegy", label: "Elméleti zh jegye", expr: "table(elmtabla, elm)" },
    { id: "ossz", label: "Összpontszám (max 31)", expr: "b1 + b2 + 2*gy1 + 2*gy2 + elmjegy" },
  ],
  outcomes: [
    {
      id: "gyak",
      label: "Gyakorlati jegy",
      kind: "gyakorlat",
      select: "first",
      gates: [
        { id: "bead", label: "Minden beadandó elfogadva", test: "count(failed, b1, b2) == 0", onFail: "none" },
        { id: "zhk", label: "Minden zh legalább 2-es", test: "count(failed, gy1, gy2, elm) == 0", onFail: "fail" },
      ],
      paths: [{ id: "alap", label: "Pontszám alapján", grade: "table(jegy, ossz)" }],
    },
  ],
  flags: [
    { field: "retakes", message: "A javító felülírja az eredetit (rosszabb esetén is)? Feltételezés: igen.", resolved: false },
    { field: "outcomes.gyak.gates.zhk", message: "Elégtelen zh esetén 1-es vagy nincs jegy? Feltételezés: 1-es.", resolved: false },
  ],
};

const progelm: SubjectRules = {
  schemaVersion: 1,
  components: [
    { id: "jelen", label: "Jelenlét", kind: "attendance", limit: { maxAbsences: 3, countExcused: true, onExceed: "none" } },
    { id: "pm", label: "Röpzh (+/−)", kind: "series", item: "ropzh", count: 12, scoring: { kind: "plusMinus" } },
    {
      id: "kviz",
      label: "Canvas előadás-kvíz",
      kind: "series",
      item: "quiz",
      count: 8,
      scoring: { kind: "percent", passAt: 60, attempts: 5, onTimeOnly: true },
    },
    { id: "bonusz", label: "Bónuszpont", kind: "bonus", cap: 8 },
    { id: "zh1", label: "1. zh", kind: "exam", scale: { kind: "points", max: 60 } },
    { id: "zh2", label: "2. zh", kind: "exam", scale: { kind: "points", max: 60 } },
    { id: "elo", label: "Canvas elővizsga", kind: "exam", scale: { kind: "grade" } },
    { id: "szobeli", label: "Szóbeli vizsga", kind: "exam", scale: { kind: "grade" } },
  ],
  retakes: [{ id: "pot", label: "Pótzh", targets: ["zh1", "zh2"], pick: "worse", mode: "replace" }],
  tables: [],
  derived: [
    { id: "minusz", label: "Mínuszok (igazolatlan hiányzással)", expr: "count(minus, pm) + count(unexcused, jelen)" },
    { id: "plusz", label: "Pluszok", expr: "count(plus, pm)" },
    { id: "zhossz", label: "A két zh összege", expr: "zh1 + zh2" },
    { id: "kvizok", label: "Kvíz feltétel (5/8)", expr: "count(passed, kviz) >= 5" },
    { id: "atmegy", label: "Bónusz nélkül is átmegy", expr: "zh2 >= 20 && zhossz >= 40" },
    { id: "bonuszbe", label: "Beszámított bónusz", expr: "if(atmegy, bonusz, 0)" },
  ],
  outcomes: [
    {
      id: "gyak",
      label: "Gyakorlati jegy",
      kind: "gyakorlat",
      select: "first",
      gates: [{ id: "pm", label: "Mínuszok ≤ pluszok", test: "minusz <= plusz", onFail: "none" }],
      paths: [
        {
          id: "alap",
          label: "ZH-k alapján",
          gates: [
            { id: "zh2", label: "2. zh (vagy pótja) ≥ 20", test: "zh2 >= 20", onFail: "fail" },
            { id: "ossz", label: "A két zh összege ≥ 40", test: "zhossz >= 40", onFail: "fail" },
          ],
          grade: "floor((zhossz + bonuszbe) / 20)",
        },
      ],
    },
    {
      id: "vizsga",
      label: "Vizsgajegy",
      kind: "vizsga",
      select: "best",
      paths: [
        {
          id: "elo",
          label: "Elővizsga",
          grade: "elo",
          post: [
            { kind: "cap", max: 4 },
            { kind: "add", when: "!kvizok", delta: -1, label: "5-nél kevesebb kvíz határidőre" },
          ],
        },
        { id: "szobeli", label: "Szóbeli", grade: "szobeli" },
      ],
    },
  ],
  flags: [
    { field: "components.pm.count", message: "Gyakorlatok száma nincs megadva; 12 feltételezve (órarendből pontosítható).", resolved: false },
    { field: "components.jelen.limit", message: "Igazolt hiányzás beleszámít a 4-be? Feltételezés: igen.", resolved: false },
    { field: "outcomes.vizsga.paths.elo.post", message: "Előbb a 4-es plafon, aztán a −1 (5 → 3)? Feltételezés: igen.", resolved: false },
    { field: "outcomes.vizsga", message: "Kell-e vizsgához legalább 2-es gyakorlati jegy? Nincs megadva.", resolved: false },
  ],
};

const NAGYZH: Scale = { kind: "points", max: 50, passAt: 17 };

const matek: SubjectRules = {
  schemaVersion: 1,
  components: [
    { id: "jelen", label: "Jelenlét", kind: "attendance", limit: { maxAbsences: 6, countExcused: true, onExceed: "none" } },
    { id: "rzh", label: "Röpzh", kind: "series", item: "ropzh", count: 10, scoring: { kind: "points", max: 4 } },
    { id: "n1", label: "1. nagyzh", kind: "exam", scale: NAGYZH },
    { id: "n2", label: "2. nagyzh", kind: "exam", scale: NAGYZH },
    { id: "n3", label: "3. nagyzh", kind: "exam", scale: NAGYZH },
    {
      id: "gyakuv",
      label: "Gyakorlati utóvizsga",
      kind: "exam",
      scale: {
        kind: "points",
        max: 75,
        passAt: 30,
        parts: [
          { id: "t1", label: "1. témakör", max: 25, passAt: 7 },
          { id: "t2", label: "2. témakör", max: 25, passAt: 7 },
          { id: "t3", label: "3. témakör", max: 25, passAt: 7 },
        ],
      },
    },
  ],
  retakes: [
    {
      id: "jav",
      label: "Javító zh",
      targets: ["n1", "n2", "n3"],
      pick: "failed",
      mode: "ifBetter",
      eligible: "countRaw(failed, n1, n2, n3) == 1",
    },
  ],
  tables: [{ id: "jegy", rows: [{ min: 0, value: 2 }, { min: 75, value: 3 }, { min: 99, value: 4 }, { min: 123, value: 5 }] }],
  derived: [
    { id: "rossz", label: "Bukott nagyzh-k", expr: "count(failed, n1, n2, n3)" },
    { id: "rossz_eredeti", label: "Bukott nagyzh-k (javító előtt)", expr: "countRaw(failed, n1, n2, n3)" },
    { id: "rok", label: "Röpzh teljesítve (≥ 20)", expr: "rzh >= 20" },
    { id: "bonusz", label: "Röpzh bónusz (20 fölött)", expr: "max(0, rzh - 20)" },
    { id: "ossz", label: "Összpontszám", expr: "n1 + n2 + n3 + bonusz" },
  ],
  outcomes: [
    {
      id: "gyak",
      label: "Gyakorlati jegy",
      kind: "gyakorlat",
      select: "first",
      paths: [
        {
          id: "uv",
          label: "Gyakorlati utóvizsga (max 2)",
          when: "rossz_eredeti >= 2 || (taken(jav) && rossz >= 1)",
          gates: [{ id: "uv", label: "Témakörönként ≥ 7, összesen ≥ 30", test: "count(passed, gyakuv) == 1", onFail: "fail" }],
          grade: "2",
        },
        {
          id: "alap",
          label: "Nagyzh-k alapján",
          gates: [{ id: "mind", label: "Mindhárom nagyzh ≥ 17", test: "rossz == 0", onFail: "fail" }],
          grade: "table(jegy, ossz)",
          post: [{ kind: "add", when: "!rok", delta: -1, label: "Röpzh nem teljesült" }],
        },
      ],
    },
  ],
  flags: [
    { field: "outcomes.gyak.paths.uv.when", message: "Sikertelen javító után is jár utóvizsga? Feltételezés: igen.", resolved: false },
    { field: "outcomes.gyak.paths.alap.post", message: "A −1 a 2-esből 1-est csinál? Feltételezés: igen.", resolved: false },
    { field: "components.jelen.limit", message: "7. hiányzás következménye nincs megadva; 'nincs jegy' feltételezve.", resolved: false },
    { field: "retakes.jav", message: "Mindhárom sikeres nagyzh mellett javítható-e egy? Feltételezés: nem.", resolved: false },
  ],
};

const Z_SCALE: Scale = {
  kind: "points",
  max: 40,
  passAt: 11,
  parts: [
    { id: "tetel", label: "Tétel", max: 4 },
    { id: "feladat", label: "Feladatok", max: 36 },
  ],
};

const analizis: SubjectRules = {
  schemaVersion: 1,
  components: [
    {
      id: "rd",
      label: "Röpdolgozat",
      kind: "series",
      item: "ropzh",
      count: 10,
      scoring: {
        kind: "points",
        max: 4,
        parts: [
          { id: "elm", label: "Elmélet", max: 2 },
          { id: "gyak", label: "Gyakorlat", max: 2 },
        ],
      },
    },
    { id: "z1", label: "1. zh", kind: "exam", scale: Z_SCALE },
    { id: "z2", label: "2. zh", kind: "exam", scale: Z_SCALE },
  ],
  retakes: [
    {
      id: "pot",
      label: "Pótzh (a bukott témakörből)",
      targets: ["z1", "z2"],
      pick: "failed",
      mode: "replace",
      eligible: "countRaw(failed, z1, z2) == 1",
    },
  ],
  tables: [{ id: "jegy", rows: [{ min: 0, value: 1 }, { min: 30, value: 2 }, { min: 46, value: 3 }, { min: 61, value: 4 }, { min: 81, value: 5 }] }],
  derived: [
    { id: "f", label: "Röpdolgozatok összesen (F)", expr: "rd" },
    { id: "o", label: "Ö = F/2 + Z1 + Z2", expr: "f/2 + z1 + z2" },
  ],
  outcomes: [
    {
      id: "gyak",
      label: "Gyakorlati jegy",
      kind: "gyakorlat",
      select: "first",
      gates: [{ id: "rd", label: "Röpdolgozat: elmélet ≥ 8 és gyakorlat ≥ 8", test: "rd.elm >= 8 && rd.gyak >= 8", onFail: "fail" }],
      paths: [
        {
          id: "alap",
          label: "Ö alapján",
          gates: [{ id: "zh", label: "Mindkét zh ≥ 11", test: "count(failed, z1, z2) == 0", onFail: "fail" }],
          grade: "table(jegy, o)",
        },
      ],
    },
    {
      id: "megaj",
      label: "Megajánlott vizsgajegy",
      kind: "megajanlott",
      select: "first",
      gates: [
        { id: "jegy", label: "Van legalább 2-es gyakorlati jegy", test: "grade(gyak) >= 2", onFail: "none" },
        { id: "rdelm", label: "Röpdolgozat elmélet ≥ 12", test: "rd.elm >= 12", onFail: "none" },
        {
          id: "tetel",
          label: "Tételpontok ≥ 5 (zh-nként ≥ 2)",
          test: "z1.tetel >= 2 && z2.tetel >= 2 && z1.tetel + z2.tetel >= 5",
          onFail: "none",
        },
      ],
      paths: [{ id: "alap", label: "Gyakorlati jegy szerint", grade: "grade(gyak)" }],
    },
  ],
  flags: [
    { field: "derived.o", message: "F/2 tört pont: a táblázat határait ≥ értelemben vesszük (45,5 → 2). Kerekítés?", resolved: false },
    { field: "outcomes.megaj.paths.alap.grade", message: "A megajánlott jegy értéke nincs megadva; a gyakorlati jegy feltételezve.", resolved: false },
    { field: "components.z1.scale.parts", message: "Tétel: zh-nként 4 pont feltételezve (8-ból).", resolved: false },
  ],
};

export interface RuleTemplate {
  id: string;
  name: string;
  university: string;
  rules: SubjectRules;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  { id: "elte-ik-dotnet-gui", name: ".NET GUI programozás", university: "ELTE IK", rules: dotnet },
  { id: "elte-ik-progelm", name: "Programozáselmélet", university: "ELTE IK", rules: progelm },
  { id: "elte-ik-matalap", name: "Matematikai alapok", university: "ELTE IK", rules: matek },
  { id: "elte-ttk-analizis1", name: "Analízis I", university: "ELTE TTK", rules: analizis },
];

export function ruleTemplate(id: string): RuleTemplate | undefined {
  return RULE_TEMPLATES.find((t) => t.id === id);
}
