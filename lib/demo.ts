import { addDays, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { pickCourseColor } from "@/lib/colors";
import type { Locale } from "@/lib/i18n/locales";
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
 * `loadDemo()` merges by id. Texts follow `locale`; the Hungarian set is the default.
 */
export function buildDemoData(now: Date, locale: Locale = "hu"): AppData {
  const s = <T>(hu: T, en: T): T => (locale === "en" ? en : hu);
  const courses: Course[] = [
    {
      id: "demo-course-prog",
      name: s("Programozás", "Programming"),
      code: "IP-18PROGEG",
      semester: "2026/27/1",
      color: pickCourseColor(0),
      matchKeywords: s(["progeg", "ip-18progeg", "programozás"], ["progeg", "ip-18progeg", "programming"]),
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
          label: s("Beadandók", "Assignments"),
          url: "https://example.com/tms/prog",
        },
        {
          id: "demo-link-prog-discord",
          platformId: "discord",
          label: s("Csoport szerver", "Group server"),
          url: "https://example.com/discord/prog",
        },
      ],
      resources: demoResources("prog", now, [
        { title: s("1. előadás jegyzet", "Lecture 1 notes"), kind: "jegyzet" },
        { title: s("Múlt évi ZH feladatsor", "Last year's midterm"), kind: "zh" },
        { title: s("ZH mintamegoldás", "Midterm sample solution"), kind: "megoldas" },
      ]),
    },
    {
      id: "demo-course-anal",
      name: s("Analízis I.", "Calculus I"),
      code: "TTKMB1401",
      semester: "2026/27/1",
      color: pickCourseColor(1),
      matchKeywords: s(["analízis", "analizis", "ttkmb1401"], ["calculus", "analysis", "ttkmb1401"]),
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
          label: s("Évfolyam csoport", "Year group"),
          url: "https://example.com/messenger/anal",
        },
      ],
      resources: demoResources("anal", now, [
        { title: s("Sorozatok – jegyzet", "Series – notes"), kind: "jegyzet" },
        { title: s("Gyakorló feladatsor", "Practice problems"), kind: "zh" },
      ]),
    },
    {
      id: "demo-course-adatb",
      name: s("Adatbázisok I.", "Databases I"),
      code: "IB-ADATB1",
      semester: "2026/27/1",
      color: pickCourseColor(2),
      matchKeywords: s(["adatbázis", "adatbázisok", "adatb"], ["database", "databases", "adatb"]),
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
          label: s("Segédanyagok", "Study materials"),
          url: "https://example.com/drive/adatbazisok",
        },
      ],
      resources: demoResources("adatb", now, [
        { title: s("ER-diagram jegyzet", "ER diagram notes"), kind: "jegyzet" },
        { title: s("SQL feladatok megoldással", "SQL exercises with solutions"), kind: "megoldas" },
        { title: s("Bevezető videó", "Introduction video"), kind: "video" },
      ]),
    },
    {
      id: "demo-course-dm",
      name: s("Diszkrét matematika", "Discrete mathematics"),
      code: "TTKMB1105",
      semester: "2026/27/1",
      color: pickCourseColor(3),
      matchKeywords: s(["diszkrét", "diszkret", "dm"], ["discrete", "diszkret", "dm"]),
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
        { title: s("Gráfelmélet jegyzet", "Graph theory notes"), kind: "jegyzet" },
        { title: s("Korábbi vizsgasor", "Past exam paper"), kind: "zh" },
      ]),
    },
  ];

  const deadlines: Deadline[] = [
    {
      id: "demo-dl-1",
      courseId: "demo-course-prog",
      title: s("1. beadandó", "Assignment 1"),
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
      title: s("ZH 1", "Midterm 1"),
      due: dueAt(now, -1, 10, 0),
      critical: false,
      done: true,
      source: "manual",
    },
    {
      id: "demo-dl-3",
      courseId: "demo-course-anal",
      title: s("Gyakorlati feladatlap – 3. hét", "Practice worksheet – week 3"),
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
      title: s("Canvas kvíz – 3. hét", "Canvas quiz – week 3"),
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
      title: s("2. házi feladat", "Homework 2"),
      due: dueAt(now, 5, 23, 59),
      critical: false,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-6",
      courseId: "demo-course-adatb",
      title: s("Projektterv leadása", "Project plan submission"),
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
      title: s("ZH 2", "Midterm 2"),
      due: dueAt(now, 14, 10, 0),
      critical: false,
      done: false,
      source: "manual",
    },
    {
      id: "demo-dl-8",
      courseId: "demo-course-dm",
      title: s("Vizsgajelentkezés határideje", "Exam registration deadline"),
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
