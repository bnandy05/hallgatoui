import type { Scale, SubjectRules } from "./types";

const Z_SCALE: Scale = {
  kind: "points",
  max: 40,
  passAt: 11,
  parts: [
    { id: "tetel", label: "Tétel", max: 4 },
    { id: "feladat", label: "Feladatok", max: 36 },
  ],
};

export const calculusDemoRules: SubjectRules = {
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
