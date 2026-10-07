// The confirmed survey form → SubjectRules. Pure. Nothing is guessed silently: every assumption
// becomes an "Ellenőrizd" rule flag, and a form that cannot be written as rules gives Hungarian
// errors instead (the same all-or-nothing rule as the parser: a result that fails validation is
// never saved).

import type {
  AssignmentComponent,
  Derived,
  ExamComponent,
  Gate,
  Outcome,
  RuleComponent,
  RuleFlag,
  SeriesComponent,
  SubjectRules,
} from "../../types";
import { validateRules } from "../../validate";
import { semanticErrors } from "../semantic";
import { GRADE_LIMIT_FIELDS, asCount, asNumber, asText, gatedValues, type FieldValue, type NumberValue, type SurveyValues } from "./fields";

export const CANNOT_WRITE_GRADE =
  "A jegy kiszámítását nem tudjuk felírni; válaszd a ponthatáros vagy az átlagos módot, vagy add meg a szabályokat kézzel.";

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4).replace(".", ",");
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => String(Math.round(n * 1e6) / 1e6);

interface Built {
  flags: RuleFlag[];
  errors: string[];
}
const flag = (b: Built, field: string, message: string) => b.flags.push({ field, message, resolved: false });

/** A points value; a percent where points belong is read as points, with a flag. */
function points(b: Built, v: FieldValue, field: string, what: string): number | null {
  const n = asNumber(v);
  if (!n) return null;
  if (n.percent) flag(b, field, `${what}: százalékként kaptuk (${fmt(n.value)}%), pontnak vettük.`);
  return n.value;
}

/** A minimum given in points or as a percent of `of`. */
function minimum(v: NumberValue | null, of: number): number | null {
  if (!v) return null;
  return v.percent ? round2((v.value / 100) * of) : v.value;
}

export function surveyRules(input: SurveyValues): { rules: SubjectRules | null; errors: string[] } {
  const v = gatedValues(input);
  const b: Built = { flags: [], errors: [] };
  const components: RuleComponent[] = [];
  const retakes: SubjectRules["retakes"] = [];
  const derived: Derived[] = [];
  const tables: SubjectRules["tables"] = [];
  const outcomes: Outcome[] = [];

  const types = asText(v.grade_types);
  if (!types) return { rules: null, errors: ["Add meg, milyen jegyet kap a hallgató."] };
  const calc = asText(v.grade_calculation);
  const examOnly = types === "exam_only";

  // ----- attendance -----
  if (v.attendance_mandatory === true) {
    const max = asCount(v.max_absences) ?? (asNumber(v.max_absences)?.percent ? null : asNumber(v.max_absences)?.value ?? null);
    components.push({
      id: "jelen",
      label: "Jelenlét",
      kind: "attendance",
      ...(max !== null && { limit: { maxAbsences: max, countExcused: true, onExceed: "none" as const } }),
    });
    if (max !== null) flag(b, "jelen", "Feltételeztük, hogy az igazolt hiányzás is beszámít, és túllépés esetén nincs jegy.");
    else flag(b, "jelen", "A hiányzási határt nem ismerjük; add meg a szabályszerkesztőben.");
    if (examOnly) flag(b, "jelen", "A jelenléti határ csak a gyakorlati jegyre hat, a vizsgajegyre nem.");
  }

  // ----- zh -----
  const zhIds: string[] = [];
  const zhGates: Gate[] = [];
  const terms: { expr: string; max: number }[] = [];
  const scoring = asText(v.zh_scoring);
  const gradeZh = scoring === "grade_1_5";
  if (scoring !== null && scoring !== "no_zh") {
    const count = asCount(v.zh_count);
    if (count === null) b.errors.push("Add meg, hány zárthelyit írnak.");
    else {
      const labelOf = (i: number) => (count === 1 ? "Zh" : `${i}. zh`);
      const max = scoring === "points" || scoring === "pass_fail" ? (scoring === "points" ? points(b, v.zh_max_points, "zh", "A zh maximuma") : 1) : null;
      const min = scoring === "points" && max !== null ? minimum(asNumber(v.zh_min_points), max) : null;
      if (scoring === "points" && max === null) b.errors.push("Add meg egy zárthelyi maximális pontszámát.");
      if (scoring === "not_described") b.errors.push("Add meg, hogyan értékelik a zárthelyiket.");
      if (scoring === "pass_fail") flag(b, "zh", "A zh-k megfelelt / nem felelt meg értékelésűek; 1 pontnak vettük a megfelelt eredményt.");
      for (let i = 1; i <= count && (scoring === "grade_1_5" || max !== null); i++) {
        const id = `zh${i}`;
        const scale: ExamComponent["scale"] =
          scoring === "grade_1_5"
            ? { kind: "grade" }
            : scoring === "pass_fail"
              ? { kind: "points", max: 1, passAt: 1 }
              : { kind: "points", max: max!, ...(min !== null && { passAt: min }) };
        components.push({ id, label: labelOf(i), kind: "exam", scale });
        zhIds.push(id);
        if (scoring === "points") terms.push({ expr: id, max: max! });
        if (min !== null) zhGates.push({ id: `min_${id}`, label: `${labelOf(i)}: legalább ${fmt(min)} pont`, test: `${id} >= ${num(min)}`, onFail: "fail" });
        if (scoring === "pass_fail") zhGates.push({ id: `min_${id}`, label: `${labelOf(i)}: megfelelt`, test: `${id} >= 1`, onFail: "fail" });
      }
    }
  }

  // ----- short tests -----
  const quickGates: Gate[] = [];
  if (v.has_quick_tests === true) {
    const total = points(b, v.quick_test_total_max, "ropzh", "A röpzh-k összpontszáma");
    if (total === null) b.errors.push("Add meg a röpzh-k összpontszámát.");
    else {
      const known = asCount(v.quick_test_count);
      const count = known ?? 1;
      const perItem = round2(total / count);
      if (known === null) flag(b, "ropzh", "A röpzh-k számát nem találtuk; 1 alkalomnak vettük, a teljes pontszámmal.");
      else if (!Number.isInteger(total / count)) flag(b, "ropzh", `A röpzh-k pontszáma nem osztható egyenlően (${fmt(total)} / ${count}); alkalmanként ${fmt(perItem)} pontot vettünk.`);
      const series: SeriesComponent = {
        id: "ropzh",
        label: "Röpzh-k",
        kind: "series",
        item: "ropzh",
        count,
        scoring: { kind: "points", max: perItem },
      };
      components.push(series);
      terms.push({ expr: "ropzh", max: round2(perItem * count) });
      const min = minimum(asNumber(v.quick_test_min_points), total);
      if (min !== null) quickGates.push({ id: "min_ropzh", label: `Röpzh-k: legalább ${fmt(min)} pont`, test: `ropzh >= ${num(min)}`, onFail: "fail" });
    }
  }

  // ----- assignments -----
  const assignGates: Gate[] = [];
  if (v.has_assignment === true) {
    const pts = points(b, v.assignment_points_on_time, "beadando", "A beadandó pontszáma");
    if (pts === null) b.errors.push("Add meg egy határidőre leadott beadandó pontszámát.");
    else {
      const known = asCount(v.assignment_count);
      const count = known ?? 1;
      if (known === null) flag(b, "beadando", "A beadandók számát nem találtuk; 1-nek vettük.");
      const ids: string[] = [];
      for (let i = 1; i <= count; i++) {
        const id = `beadando${i}`;
        const c: AssignmentComponent = {
          id,
          label: count === 1 ? "Beadandó" : `${i}. beadandó`,
          kind: "assignment",
          outcomes: [
            { id: "ok", label: "Határidőre beadva", points: pts, accepted: true },
            { id: "nem", label: "Nem fogadták el", points: 0, accepted: false },
          ],
        };
        components.push(c);
        ids.push(id);
        terms.push({ expr: id, max: pts });
      }
      assignGates.push({ id: "bead", label: count === 1 ? "A beadandó el van fogadva" : "Minden beadandó el van fogadva", test: `count(failed, ${ids.join(", ")}) == 0`, onFail: "none" });
      flag(b, "beadando", "Feltételeztük, hogy minden beadandót el kell fogadni a jegyhez.");
    }
  }

  // ----- theory test during the semester -----
  const theoryGates: Gate[] = [];
  if (v.has_theory_test_in_semester === true) {
    const t = asNumber(v.theory_test_pass_threshold);
    components.push({
      id: "elmelet",
      label: "Elméleti teszt",
      kind: "exam",
      scale: { kind: "points", max: 100, ...(t && { passAt: t.value }) },
    });
    if (t) {
      theoryGates.push({ id: "elmelet", label: `Elméleti teszt: legalább ${fmt(t.value)}${t.percent ? "%" : " pont"}`, test: `elmelet >= ${num(t.value)}`, onFail: "fail" });
      if (!t.percent) flag(b, "elmelet", "Az elméleti teszt maximumát nem ismerjük; 100 pontnak vettük, a küszöb pontban van megadva.");
    } else {
      flag(b, "elmelet", "Az elméleti teszt sikerességi küszöbe nincs megadva.");
    }
  }

  // ----- retakes and offered grade -----
  if (v.has_retake === true) {
    if (zhIds.length > 0) {
      retakes.push({ id: "potzh", label: "Pótzh", targets: zhIds, pick: "choose", mode: "replace" });
      flag(b, "potzh", "Ellenőrizd, melyik zh-t és hogyan váltja ki a pótzh.");
    } else {
      flag(b, "potzh", "A dokumentum pótlásról ír, de zárthelyit nem találtunk; add meg a pótlást a szabályszerkesztőben.");
    }
  }
  if (v.has_offered_exam_grade === true) {
    flag(b, "megajanlott", "A megajánlott jegy feltételét a szabályszerkesztőben add meg.");
  }

  // ----- grade -----
  const inSemesterGates = [...zhGates, ...quickGates, ...theoryGates, ...assignGates];
  const hasExam = types === "exam_only" || types === "practice_and_exam";
  if (hasExam) components.push({ id: "vizsga", label: "Vizsga", kind: "exam", scale: { kind: "grade" } });

  if (!examOnly) {
    if (types === "unclear") flag(b, "grade", "A dokumentum nem egyértelműen írja le, milyen jegyet kap a hallgató; gyakorlati jegyet vettünk.");
    let grade: string | null = null;
    let label = "";
    if (calc === "raw_points_to_bands") {
      if (gradeZh) b.errors.push("A zárthelyik jegyét nem lehet pontként összeadni; válaszd az átlagos módot.");
      if (terms.length === 0 && b.errors.length === 0) b.errors.push("Nincs pontozott összetevő, amelyből a ponthatárok szerinti jegy kiszámolható.");
      const sum = terms.reduce((s, t) => s + t.max, 0);
      const limits = GRADE_LIMIT_FIELDS.map((f) => asNumber(v[f]));
      if (limits.some((l) => l === null)) b.errors.push("Add meg mind a négy ponthatárt (2-estől 5-ösig).");
      else if (limits.some((l) => l!.percent) && limits.some((l) => !l!.percent)) b.errors.push("A ponthatárok egy része százalék, másik része pont; add meg egységesen.");
      else if (terms.length > 0) {
        const stated = asNumber(v.final_total_max);
        const total = stated && !stated.percent ? stated.value : sum;
        const rows: { min: number; value: number }[] = [];
        limits.forEach((l, i) => rows.push({ min: l!.percent ? round2((l!.value / 100) * total) : l!.value, value: i + 2 }));
        // Below the lowest limit is 1; a lowest limit of 0 leaves nothing below it.
        if (rows[0].min > 0) rows.unshift({ min: 0, value: 1 });
        tables.push({ id: "jegy", rows });
        derived.push({ id: "ossz", label: `Összpontszám (max ${fmt(sum)})`, expr: terms.map((t) => t.expr).join(" + ") });
        grade = "table(jegy, ossz)";
        label = "Pontszám alapján";
      }
    } else if (calc === "average_of_grades") {
      if (!gradeZh || zhIds.length === 0) b.errors.push("Az átlagos módhoz jeggyel értékelt zárthelyik kellenek.");
      else {
        derived.push({ id: "atlag", label: "Az összetevők jegyének átlaga", expr: zhIds.length === 1 ? zhIds[0] : `(${zhIds.join(" + ")}) / ${zhIds.length}` });
        grade = "floor(atlag + 0.5)";
        label = "Átlag alapján";
        flag(b, "atlag", "Az átlagot egyenlő súllyal, a szokásos kerekítéssel számoltuk.");
      }
    } else {
      b.errors.push(CANNOT_WRITE_GRADE);
    }
    outcomes.push({
      id: "gyak",
      label: "Gyakorlati jegy",
      kind: "gyakorlat",
      select: "first",
      ...(inSemesterGates.length > 0 && { gates: inSemesterGates }),
      paths: [{ id: "alap", label: label || "Alap", grade: grade ?? "1" }],
    });
    if (types === "practice_and_exam") {
      outcomes.push({
        id: "vizs",
        label: "Vizsgajegy",
        kind: "vizsga",
        select: "first",
        gates: [{ id: "gyakjegy", label: "Legalább elégséges gyakorlati jegy", test: "grade(gyak) >= 2", onFail: "none" }],
        paths: [{ id: "alap", label: "Vizsga", grade: "vizsga" }],
      });
    }
  } else {
    outcomes.push({
      id: "vizs",
      label: "Vizsgajegy",
      kind: "vizsga",
      select: "first",
      ...(inSemesterGates.length > 0 && { gates: inSemesterGates }),
      paths: [{ id: "alap", label: "Vizsga", grade: "vizsga" }],
    });
    const limitsRead = GRADE_LIMIT_FIELDS.some((f) => asNumber(v[f]) !== null);
    if (limitsRead) flag(b, "grade", "A ponthatárokat nem kötöttük a vizsgajegyhez; a vizsgajegyet te rögzíted.");
  }
  flag(b, "survey", "Automatikusan olvastuk ki; vesd össze a dokumentummal.");

  if (b.errors.length > 0) return { rules: null, errors: b.errors };
  if (components.length === 0) return { rules: null, errors: ["Nincs egyetlen összetevő sem, amiből szabály állítható össze."] };

  const checked = validateRules({ schemaVersion: 1, components, retakes, derived, tables, outcomes, flags: b.flags });
  if (!checked.ok) return { rules: null, errors: checked.errors.map((e) => `Érvénytelen szabály: ${e}`) };
  const semantic = semanticErrors(checked.rules, new Date());
  if (semantic.length > 0) return { rules: null, errors: semantic };
  return { rules: checked.rules, errors: [] };
}

