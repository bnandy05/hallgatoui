// Grade alerts (Hungarian source): the alert texts of lib/gradeAlerts.ts and the kind names and
// descriptions the settings show. Mounted as `gradeAlerts` by `hu.ts`.

const d = (v: number | string): string => String(v).replace(".", ",");

const ADJ = ["nincs jegy", "1-es", "2-es", "3-as", "4-es", "5-ös"];
const TO = ["", "1-eshez", "2-eshez", "3-ashoz", "4-eshez", "5-öshöz"];
const artLower = (g: number) => (g === 1 || g === 5 ? "az" : "a");
const artUpper = (g: number) => (g === 1 || g === 5 ? "Az" : "A");

export const gradeAlertsHu = {
  kinds: {
    opportunity: {
      name: "Jobb jegy elérhető",
      description: "Egy közelgő számonkérésen elérhető pontszámmal jobb jegyet szerezhetsz.",
    },
    risk: {
      name: "Veszélyben a jegy",
      description: "A jegy vagy a teljesítés veszélyben van: nem teljesült feltétel vagy nehezen elérhető ponthatár.",
    },
    absence: {
      name: "Hiányzási határ",
      description: "Már csak kevés (vagy semennyi) hiányzás fér bele.",
    },
    change: {
      name: "Jegy változása",
      description: "Egy rögzített eredmény véglegessé tett vagy megváltoztatott egy jegyet.",
    },
  },
  settings: {
    title: "Jegy-figyelmeztetések",
    sub: "Jelzés, ha egy jegyed mozdulhat: jobb jegy van kilátásban, veszélybe került, közel a hiányzási határ, vagy egy eredmény változtatott rajta.",
    kind: "Figyelmeztetés",
    bell: "Csengő",
    email: "E-mail",
    sendEmail: "E-mail küldése",
    sendEmailHint: "Sürgős figyelmeztetést legfeljebb naponta egyet küldünk, és egy „Jegyek” blokkot az összefoglalóba, ha kapsz ilyet.",
    sendTo: (address: string) => `Címzett: ${address}`,
    emailOff: "E-mailben csak akkor kapsz figyelmeztetést, ha bekapcsolod az „E-mail küldése” kapcsolót.",
    emailUnavailable: "Az e-mailes figyelmeztetés még nem érhető el.",
    emailLoading: "Betöltés…",
    emailError: "Az e-mailes beállítást most nem sikerült elérni.",
    switchLabel: (kind: string, channel: string) => `${kind}: ${channel}`,
    emptyTitle: "Még egy tárgyhoz sincs szabály",
    emptyText: "A figyelmeztetések a tárgyak követelményeiből számolódnak. Nyiss meg egy tárgyat, és állítsd be a követelményeit.",
    emptyLink: "Tárgy megnyitása",
    emptyLinkNone: "Tárgyak",
  },
  text: {
    opportunityPoints: (label: string, min: number, max: number, goal: number) =>
      `${label}: ${d(min)}/${d(max)} pont kell ${artLower(goal)} ${TO[goal]}`,
    opportunityGrade: (label: string, min: number, goal: number) =>
      `${label}: legalább ${ADJ[min]} kell ${artLower(goal)} ${TO[goal]}`,
    unreachable: (outcome: string) => `${outcome}: már nem teljesíthető`,
    hardPoints: (label: string, min: number, max: number, pass: number) =>
      `${label}: ${artLower(pass)} ${TO[pass]} ${d(min)}/${d(max)} pont kell`,
    hardGrade: (label: string, min: number, pass: number) =>
      `${label}: ${artLower(pass)} ${TO[pass]} legalább ${ADJ[min]} kell`,
    settled: (grade: number) => `Végleges: ${grade > 0 ? grade : "nincs jegy"}`,
    secured: (grade: number) => `${artUpper(grade)} ${ADJ[grade]} már biztos`,
    lost: (grade: number) => `${artUpper(grade)} ${ADJ[grade]} már nem érhető el`,
    outcomePrefix: (outcome: string, text: string) => `${outcome}: ${text}`,
  },
} as const;
