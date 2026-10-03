import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDedupe,
  deadlineIdentity,
  deadlineSourceKey,
  findDuplicates,
  pairKey,
} from "@/lib/ical/dedupe";
import { buildCalendar } from "@/lib/ical/export";
import { mergeFeedSync } from "@/lib/ical/sync";
import { parseIcs } from "@/lib/ical/parse";
import type { Deadline } from "@/lib/types";
import { readFixture } from "./fixtures";
import { makeCourse, makeDeadline, makeFeed } from "./helpers";

const course = { ...makeCourse("c1", "Diszkrét matematika I", ["IP-18DM1E", "K8VOV1-DM1gy2026osz"]), code: "IP-18DM1E 1" };
const other = makeCourse("c2", "Programozáselmélet");
const courses = [course, other];
const canvasFeed = makeFeed({ id: "f-canvas", platformId: "canvas" });
const canvasFeed2 = makeFeed({ id: "f-canvas2", platformId: "canvas" });
const neptunFeed = makeFeed({ id: "f-neptun", platformId: "neptun" });
const moodleFeed = makeFeed({ id: "f-moodle", platformId: "moodle" });
const feeds = [canvasFeed, canvasFeed2, neptunFeed, moodleFeed];

const ALL_DAY = "2026-10-12T21:59:00.000Z"; // 23:59 Budapest, 12 Oct
const NOON = "2026-10-12T10:00:00.000Z";

function feedDeadline(id: string, feed: { id: string; platformId: string }, title: string, due: string, extra: Partial<Deadline> = {}) {
  return makeDeadline({
    id, title, due, courseId: "c1", source: "ical", feedId: feed.id, externalUid: `uid-${id}`,
    platformId: feed.platformId, ...extra,
  });
}
const manual = (id: string, title: string, due: string, extra: Partial<Deadline> = {}) =>
  makeDeadline({ id, title, due, courseId: "c1", ...extra });

function groups(deadlines: Deadline[], ignored: string[] = []) {
  return findDuplicates(deadlines, feeds, ignored, courses).map((g) => ({
    primary: g.primary.id,
    others: g.others.map((d) => d.id).sort(),
  }));
}

const cases: { name: string; deadlines: Deadline[]; expected: { primary: string; others: string[] }[] }[] = [
  {
    name: "Canvas 'Beadandó 01' + manual 'Beadandó 1' merge, manual is primary",
    deadlines: [
      feedDeadline("cv", canvasFeed, "Beadandó 01", ALL_DAY),
      manual("mn", "Beadandó 1", ALL_DAY),
    ],
    expected: [{ primary: "mn", others: ["cv"] }],
  },
  {
    name: "Neptun exam + Canvas exam 30 min apart merge, Canvas is primary",
    deadlines: [
      feedDeadline("np", neptunFeed, "Diszkrét matematika I ZH", "2026-10-12T10:00:00.000Z"),
      feedDeadline("cv", canvasFeed, "ZH", "2026-10-12T10:30:00.000Z", { title: "ZH" }),
    ],
    expected: [{ primary: "cv", others: ["np"] }],
  },
  {
    name: "containment is whole-token: manual 'ZH' vs Canvas 'röpZh 01' do not merge",
    deadlines: [
      manual("mn", "ZH", NOON),
      feedDeadline("cv", canvasFeed, "röpZh 01", NOON),
    ],
    expected: [],
  },
  {
    name: "containment is whole-token: 'quiz' vs 'quizlet'",
    deadlines: [
      feedDeadline("a", canvasFeed, "Quiz", NOON),
      feedDeadline("b", neptunFeed, "Quizlet házi", NOON),
    ],
    expected: [],
  },
  {
    name: "same feed never merges",
    deadlines: [
      feedDeadline("a", canvasFeed, "röpZh 01", NOON),
      feedDeadline("b", canvasFeed, "Röp zh 01_ 2. kérdés", NOON),
    ],
    expected: [],
  },
  {
    name: "two manual deadlines never merge",
    deadlines: [manual("a", "Beadandó 1", ALL_DAY), manual("b", "Beadandó 1", ALL_DAY)],
    expected: [],
  },
  {
    name: "number guard: Beadandó 02 vs 03",
    deadlines: [
      feedDeadline("a", canvasFeed, "Beadandó 02", ALL_DAY),
      feedDeadline("b", neptunFeed, "Beadandó 03", ALL_DAY),
    ],
    expected: [],
  },
  {
    name: "different course",
    deadlines: [
      feedDeadline("a", canvasFeed, "Beadandó 1", ALL_DAY),
      feedDeadline("b", neptunFeed, "Beadandó 1", ALL_DAY, { courseId: "c2" }),
    ],
    expected: [],
  },
  {
    name: "no course never merges",
    deadlines: [
      feedDeadline("a", canvasFeed, "Beadandó 1", ALL_DAY, { courseId: null }),
      feedDeadline("b", neptunFeed, "Beadandó 1", ALL_DAY, { courseId: null }),
    ],
    expected: [],
  },
  {
    name: "different Budapest day",
    deadlines: [
      feedDeadline("a", canvasFeed, "Beadandó 1", ALL_DAY),
      feedDeadline("b", neptunFeed, "Beadandó 1", "2026-10-13T21:59:00.000Z"),
    ],
    expected: [],
  },
  {
    name: "timed deadlines more than 60 min apart",
    deadlines: [
      feedDeadline("a", canvasFeed, "Beadandó 1", "2026-10-12T08:00:00.000Z"),
      feedDeadline("b", neptunFeed, "Beadandó 1", "2026-10-12T09:30:00.000Z"),
    ],
    expected: [],
  },
  {
    name: "an all-day deadline matches a timed one on the same day",
    deadlines: [
      feedDeadline("a", canvasFeed, "Beadandó 1", ALL_DAY),
      feedDeadline("b", neptunFeed, "Beadandó 1", "2026-10-12T06:00:00.000Z"),
    ],
    expected: [{ primary: "a", others: ["b"] }],
  },
  {
    name: "three-way group: manual > canvas > neptun",
    deadlines: [
      feedDeadline("np", neptunFeed, "Beadandó 1", ALL_DAY),
      feedDeadline("cv", canvasFeed, "Beadandó 01", ALL_DAY),
      manual("mn", "beadando 1", ALL_DAY),
    ],
    expected: [{ primary: "mn", others: ["cv", "np"] }],
  },
  {
    name: "priority canvas > moodle > neptun > custom",
    deadlines: [
      feedDeadline("np", neptunFeed, "Beadandó 1", ALL_DAY),
      feedDeadline("md", moodleFeed, "Beadandó 1", ALL_DAY),
      feedDeadline("cv", canvasFeed, "Beadandó 1", ALL_DAY),
    ],
    expected: [{ primary: "cv", others: ["md", "np"] }],
  },
];

for (const c of cases) {
  test(c.name, () => assert.deepEqual(groups(c.deadlines), c.expected));
}

test("an ignored pair does not merge", () => {
  const a = feedDeadline("cv", canvasFeed, "Beadandó 01", ALL_DAY);
  const b = manual("mn", "Beadandó 1", ALL_DAY);
  assert.equal(groups([a, b]).length, 1);
  assert.deepEqual(groups([a, b], [pairKey(a, b)]), []);
  assert.equal(pairKey(a, b), pairKey(b, a));
});

test("identities of feed deadlines ignore the random id", () => {
  const a = feedDeadline("x1", canvasFeed, "T", NOON);
  const b = { ...a, id: "x2" };
  assert.equal(deadlineIdentity(a), deadlineIdentity(b));
  assert.equal(deadlineIdentity(manual("m", "T", NOON)), "manual:m");
  assert.equal(deadlineSourceKey(a, feeds), "canvas");
  assert.equal(deadlineSourceKey(manual("m", "T", NOON), feeds), "manual");
});

test("applyDedupe hides the copies and respects 'enabled'", () => {
  const deadlines = [
    feedDeadline("cv", canvasFeed, "Beadandó 01", ALL_DAY),
    manual("mn", "Beadandó 1", ALL_DAY),
    manual("solo", "Egyéb", ALL_DAY),
  ];
  const on = applyDedupe(deadlines, feeds, [], true, courses);
  assert.deepEqual(on.visible.map((d) => d.id), ["mn", "solo"]);
  assert.deepEqual(on.extras.get("mn")?.map((d) => d.id), ["cv"]);
  assert.equal(applyDedupe(deadlines, feeds, [], false, courses).visible.length, 3);
});

test("real fixture: a re-synced Canvas deadline and a manual copy merge", () => {
  const events = parseIcs(readFixture("canvas.ics"));
  const feed = makeFeed({ id: "f-fixture", platformId: "canvas" });
  const synced = mergeFeedSync({
    feed, events, deadlines: [], courses: [course], now: new Date("2026-10-01T10:00:00.000Z"),
  }).deadlines;
  const target = synced.find((d) => d.externalUid === "event-assignment-override-80509")!;
  assert.equal(target.title, "Beadandó 04");
  assert.equal(target.courseId, "c1");
  const copy = manual("mn", "Beadandó 4", target.due);
  const found = findDuplicates([...synced, copy], [feed], [], [course]);
  assert.equal(found.length, 1);
  assert.equal(found[0].primary.id, "mn");
  assert.equal(found[0].others[0].id, target.id);
});

test("buildCalendar: dedupe on/off changes the VEVENT count and lists the sources", () => {
  const deadlines = [
    feedDeadline("cv", canvasFeed, "Beadandó 01", ALL_DAY, { url: "https://canvas.example/a/1" }),
    manual("mn", "Beadandó 1", ALL_DAY, { url: "https://example.com/mine" }),
  ];
  const base = { courses, deadlines, feeds, now: new Date("2026-10-05T08:00:00.000Z") };
  const count = (ics: string) => parseIcs(ics).filter((e) => e.summary.includes("Beadand")).length;

  const off = buildCalendar({ ...base, options: { dedupe: false } });
  assert.equal(count(off), 2);

  const on = buildCalendar({ ...base, options: { dedupe: true } });
  assert.equal(count(on), 1);
  const event = parseIcs(on).find((e) => e.summary.includes("Beadand"))!;
  assert.match(event.description ?? "", /Források:/);
  assert.match(event.description ?? "", /Kézi: https:\/\/example\.com\/mine/);
  assert.match(event.description ?? "", /Canvas: https:\/\/canvas\.example\/a\/1/);

  // Default is on, and an ignored pair brings both back.
  assert.equal(count(buildCalendar(base)), 1);
  const ignored = [pairKey(deadlines[0], deadlines[1])];
  assert.equal(count(buildCalendar({ ...base, ignoredDuplicatePairs: ignored })), 2);
});
