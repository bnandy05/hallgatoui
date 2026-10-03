import { addDays, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { pickCourseColor } from "@/lib/colors";
import type { AppData, Course, Deadline, Resource } from "@/lib/types";

function at(base: Date, hours: number, minutes = 0): string {
  return setMilliseconds(setSeconds(setMinutes(setHours(base, hours), minutes), 0), 0).toISOString();
}

function dueAt(now: Date, dayOffset: number, hours: number, minutes = 0): string {
  return at(addDays(now, dayOffset), hours, minutes);
}

/**
 * Builds a fixed, idempotent set of demo data relative to `now`. IDs are
 * stable ("demo-…") so loading the demo twice never creates duplicates —
 * `loadDemo()` merges by id.
 */
export function buildDemoData(now: Date): AppData {
  const courses: Course[] = [
    {
      id: "demo-course-prog",
      name: "Programozás",
      code: "IP-18PROGEG",
      semester: "2026/27/1",
      color: pickCourseColor(0),
      matchKeywords: ["progeg", "ip-18progeg", "programozás"],
      createdAt: at(now, 8),
      links: [
        {
          id: "demo-link-prog-teams",
          platformId: "teams",
          url: "https://example.com/teams/programozas",
        },
        {
          id: "demo-link-prog-canvas",
          platformId: "canvas",
          url: "https://example.com/canvas/courses/prog",
        },
        {
          id: "demo-link-prog-tms",
          platformId: "tms",
          label: "Beadandók",
          url: "https://example.com/tms/prog",
        },
        {
          id: "demo-link-prog-discord",
          platformId: "discord",
          label: "Csoport szerver",
          url: "https://example.com/discord/prog",
        },
      ],
      resources: demoResources("prog", now, [
        { title: "1. előadás jegyzet", kind: "jegyzet" },
        { title: "Múlt évi ZH feladatsor", kind: "zh" },
        { title: "ZH mintamegoldás", kind: "megoldas" },
      ]),
    },
    {
      id: "demo-course-anal",
      name: "Analízis I.",
      code: "TTKMB1401",
      semester: "2026/27/1",
      color: pickCourseColor(1),
      matchKeywords: ["analízis", "analizis", "ttkmb1401"],
      createdAt: at(now, 8),
      links: [
        {
          id: "demo-link-anal-moodle",
          platformId: "moodle",
          url: "https://example.com/moodle/course/anal",
        },
        {
          id: "demo-link-anal-teams",
          platformId: "teams",
          url: "https://example.com/teams/analizis",
        },
        {
          id: "demo-link-anal-messenger",
          platformId: "messenger",
          label: "Évfolyam csoport",
          url: "https://example.com/messenger/anal",
        },
      ],
      resources: demoResources("anal", now, [
        { title: "Sorozatok – jegyzet", kind: "jegyzet" },
        { title: "Gyakorló feladatsor", kind: "zh" },
      ]),
    },
    {
      id: "demo-course-adatb",
      name: "Adatbázisok I.",
      code: "IB-ADATB1",
      semester: "2026/27/1",
      color: pickCourseColor(2),
      matchKeywords: ["adatbázis", "adatbázisok", "adatb"],
      createdAt: at(now, 8),
      links: [
        {
          id: "demo-link-adatb-canvas",
          platformId: "canvas",
          url: "https://example.com/canvas/courses/adatb",
        },
        {
          id: "demo-link-adatb-drive",
          platformId: "drive",
          label: "Segédanyagok",
          url: "https://example.com/drive/adatbazisok",
        },
      ],
      resources: demoResources("adatb", now, [
        { title: "ER-diagram jegyzet", kind: "jegyzet" },
        { title: "SQL feladatok megoldással", kind: "megoldas" },
        { title: "Bevezető videó", kind: "video" },
      ]),
    },
    {
      id: "demo-course-dm",
      name: "Diszkrét matematika",
      code: "TTKMB1105",
      semester: "2026/27/1",
      color: pickCourseColor(3),
      matchKeywords: ["diszkrét", "diszkret", "dm"],
      createdAt: at(now, 8),
      links: [
        {
          id: "demo-link-dm-neptun",
          platformId: "neptun",
          url: "https://example.com/neptun/dm",
        },
        {
          id: "demo-link-dm-moodle",
          platformId: "moodle",
          url: "https://example.com/moodle/course/dm",
        },
      ],
      resources: demoResources("dm", now, [
        { title: "Gráfelmélet jegyzet", kind: "jegyzet" },
        { title: "Korábbi vizsgasor", kind: "zh" },
      ]),
    },
  ];

  const deadlines: Deadline[] = [
    {
      id: "demo-dl-1",
      courseId: "demo-course-prog",
      title: "1. beadandó",
      due: dueAt(now, -2, 23, 59),
      platformId: "tms",
      url: "https://example.com/tms/prog/1-beadando",
      critical: false,
      done: true,
      source: "manual",
    },
    {
      id: "demo-dl-2",
      courseId: "demo-course-adatb",
      title: "ZH 1",
      due: dueAt(now, -1, 10, 0),
      critical: false,
      done: true,
      source: "manual",
    },
    {
      id: "demo-dl-3",
      courseId: "demo-course-anal",
      title: "Gyakorlati feladatlap – 3. hét",
      due: dueAt(now, 0, 23, 59),
      platformId: "moodle",
      url: "https://example.com/moodle/analizis/feladatlap-3",
      critical: true,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-4",
      courseId: "demo-course-prog",
      title: "Canvas kvíz – 3. hét",
      due: dueAt(now, 2, 23, 59),
      platformId: "canvas",
      url: "https://example.com/canvas/prog/kviz-3",
      critical: false,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-5",
      courseId: "demo-course-dm",
      title: "2. házi feladat",
      due: dueAt(now, 5, 23, 59),
      critical: false,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-6",
      courseId: "demo-course-adatb",
      title: "Projektterv leadása",
      due: dueAt(now, 9, 23, 59),
      platformId: "drive",
      url: "https://example.com/drive/adatbazisok/projektterv",
      critical: false,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-7",
      courseId: "demo-course-anal",
      title: "ZH 2",
      due: dueAt(now, 14, 10, 0),
      critical: false,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-8",
      courseId: "demo-course-dm",
      title: "Vizsgajelentkezés határideje",
      due: dueAt(now, 20, 23, 59),
      platformId: "neptun",
      url: "https://example.com/neptun/dm/vizsgajelentkezes",
      critical: false,
      done: false,
      source: "manual",
    },
  ];

  return { version: 1, courses, deadlines, customPlatforms: [], feeds: [], ignoredDuplicatePairs: [], classSessions: [], timetableSources: [] };
}

function demoResources(
  courseSlug: string,
  now: Date,
  items: { title: string; kind: Resource["kind"] }[]
): Resource[] {
  return items.map((item, index) => ({
    id: `demo-res-${courseSlug}-${index + 1}`,
    title: item.title,
    url: `https://example.com/resources/${courseSlug}/${index + 1}`,
    kind: item.kind,
    createdAt: at(addDays(now, -7 + index), 9),
  }));
}
