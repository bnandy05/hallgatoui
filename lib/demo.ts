import { addDays, addHours, setHours, setMinutes, setSeconds, setMilliseconds, startOfWeek } from "date-fns";
import { normalizeCourseName } from "@/lib/ical/canvas";
import { pickCourseColor } from "@/lib/colors";
import type { Locale } from "@/lib/i18n/locales";
import type { AppData, ClassSession, Course, Deadline, IcalFeed, Resource, TimetableSource } from "@/lib/types";

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

/**
 * The demo mode's data (no account, see lib/demoMode.ts): the sample set plus what a real semester
 * brings in from outside, so every surface has something to show: a Canvas feed (with a deadline
 * that duplicates a manual one, and one whose due date moved), a weekly series and a Neptun
 * timetable for this week and the next two. Never merged into an account (`loadDemo` uses
 * `buildDemoData` only), and the feed is never fetched (`isDemoFeedId`).
 */
export function buildShowcaseData(now: Date, locale: Locale = "hu"): AppData {
  const s = <T>(hu: T, en: T): T => (locale === "en" ? en : hu);
  const base = buildDemoData(now, locale);
  const feedId = "demo-feed-canvas";

  const feeds: IcalFeed[] = [
    {
      id: feedId,
      name: "Canvas",
      url: "https://example.com/canvas/feeds/calendars/demo.ics",
      platformId: "canvas",
      courseId: null,
      lastSyncedAt: now.toISOString(),
    },
  ];

  const fromFeed = (uid: string, courseId: string, title: string, due: string, extra: Partial<Deadline> = {}): Deadline => ({
    id: `demo-ical-${uid}`,
    courseId,
    title,
    due,
    platformId: "canvas",
    url: `https://example.com/canvas/assignments/${uid}`,
    critical: false,
    done: false,
    source: "ical",
    feedId,
    externalUid: `demo-${uid}@canvas`,
    ...extra,
  });

  const seriesTitle = s("Heti kvíz", "Weekly quiz");
  const deadlines: Deadline[] = [
    ...base.deadlines,
    // The same quiz as demo-dl-4, from Canvas: shown once, with "+1 source".
    fromFeed("quiz-3", "demo-course-prog", s("Canvas kvíz – 3. hét", "Canvas quiz – week 3"), dueAt(now, 2, 23, 59)),
    fromFeed("adatb-gy2", "demo-course-adatb", s("2. gyakorlat – SQL lekérdezések", "Practice 2 – SQL queries"), dueAt(now, 3, 23, 59)),
    // Canvas moved this one two days later a few hours ago: "changed" for 48 hours.
    fromFeed("prog-beadando-2", "demo-course-prog", s("2. beadandó", "Assignment 2"), dueAt(now, 6, 23, 59), {
      previousDue: dueAt(now, 4, 23, 59),
      dueChangedAt: addHours(now, -3).toISOString(),
    }),
    ...[1, 2, 3].map(
      (n): Deadline => ({
        id: `demo-series-${n}`,
        courseId: "demo-course-anal",
        title: `${seriesTitle} ${n}`,
        due: dueAt(now, 3 + (n - 1) * 7, 20, 0),
        platformId: "moodle",
        critical: false,
        done: false,
        source: "manual",
        seriesId: "demo-series-quiz",
      })
    ),
  ];

  const sourceId = "demo-timetable";
  const subjects: { courseId: string; subject: string; group: string; teacher: string; slots: [number, number, number, string, ClassSession["kind"]][] }[] = [
    {
      courseId: "demo-course-prog",
      subject: s("Programozás", "Programming"),
      group: "1",
      teacher: "Kiss Péter",
      slots: [[0, 10, 12, "D-0-311", "ora"], [2, 14, 16, "D-2-502", "ora"]],
    },
    {
      courseId: "demo-course-anal",
      subject: s("Analízis I.", "Calculus I"),
      group: "3",
      teacher: "Nagy Anna",
      slots: [[1, 8, 10, "É-0-100", "ora"], [3, 12, 14, "É-1-215", "ora"]],
    },
    {
      courseId: "demo-course-adatb",
      subject: s("Adatbázisok I.", "Databases I"),
      group: "2",
      teacher: "Tóth Gábor",
      slots: [[2, 10, 12, "D-0-822", "ora"]],
    },
    {
      courseId: "demo-course-dm",
      subject: s("Diszkrét matematika", "Discrete mathematics"),
      group: "1",
      teacher: "Szabó Eszter",
      slots: [[4, 10, 12, "É-0-220", "ora"]],
    },
  ];

  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const classSessions: ClassSession[] = [];
  const subjectCourses: Record<string, string | null> = {};
  for (const subject of subjects) {
    const subjectKey = normalizeCourseName(subject.subject);
    subjectCourses[subjectKey] = subject.courseId;
    for (let week = 0; week < 3; week++) {
      for (const [weekday, from, to, room, kind] of subject.slots) {
        const day = addDays(monday, week * 7 + weekday);
        const uid = `${subject.courseId}-${week}-${weekday}`;
        classSessions.push({
          id: `demo-class-${uid}`,
          sourceId,
          externalUid: `demo-${uid}@neptun`,
          kind,
          subject: subject.subject,
          subjectKey,
          group: subject.group,
          teachers: [subject.teacher],
          location: room,
          room,
          start: at(day, from),
          end: at(day, to),
          courseId: subject.courseId,
        });
      }
    }
  }
  const timetableSources: TimetableSource[] = [
    { id: sourceId, name: s("Neptun órarend", "Neptun timetable"), importedAt: now.toISOString(), subjectCourses },
  ];

  return { ...base, deadlines, feeds, classSessions, timetableSources };
}
