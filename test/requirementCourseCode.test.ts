import { test } from "node:test";
import assert from "node:assert/strict";
import { documentCourseCode, linkedCourseCode, requirementCourseCode } from "@/lib/rules/courseCode";
import type { Course, IcalFeed } from "@/lib/types";

test("collects explicit course codes from pasted requirements and PDF text without guessing", () => {
  assert.equal(documentCourseCode("Analízis követelmények\nA tárgy kódja: ip-18an1g\n10 pont"), "IP-18AN1G");
  assert.equal(documentCourseCode("Course code:\nBMEVIAUAC00\n2026/27/1"), "BMEVIAUAC00");
  assert.equal(documentCourseCode("Tantárgykód: IP-18AN1G\nSubject code: IP-18AN1G"), "IP-18AN1G");
  assert.equal(documentCourseCode("Tárgykód: IP-18AN1G, IP-18AN1E"), null);
  assert.equal(documentCourseCode("Tárgykód: IP-18AN1G\nSubject code: IP-18AN1E"), null);
  assert.equal(documentCourseCode("2026/27/1 · 50 pont"), null);
  assert.equal(requirementCourseCode("IP-18AN1G 4"), "IP-18AN1G");
  assert.equal(requirementCourseCode("IP-18AN1G 4, IP-18AN1E 1"), null);
});

test("uses matching, same-semester Canvas contexts and leaves ambiguous codes unset", () => {
  const url = "https://canvas.example.com/courses/12";
  const course: Course = {
    id: "course", name: "Analízis", semester: "2026-2027-1", color: "#000000",
    links: [{ id: "canvas", platformId: "canvas", url }], resources: [], matchKeywords: [], createdAt: "",
  };
  const context = {
    key: "canvas:12", name: "Analízis", baseName: "Analízis", groupKey: "analízis", label: "Analízis",
    courseUrl: url, code: "IP-18AN1G 4", semester: "2026/27/1", eventCount: 1,
  };
  const feed: IcalFeed = { id: "canvas", name: "Canvas", platformId: "canvas", url, courseId: null, discovered: [context] };
  assert.equal(linkedCourseCode(course, [feed]), "IP-18AN1G");
  assert.equal(linkedCourseCode(course, [{ ...feed, discovered: [{ ...context, semester: "2025/26/1" }] }]), null);
  assert.equal(linkedCourseCode(course, [{ ...feed, discovered: [context, { ...context, key: "canvas:13", code: "IP-18AN1E 1" }] }]), null);
});

test("multiple codes remain individual identities with section numbers preserved separately", async () => {
  const { courseCodes, parseCourseCodes, documentCourseCodes } = await import("@/lib/rules/courseCode");
  assert.deepEqual(parseCourseCodes("IP-18AN1E 1, IP-18AN1G 4"), [
    { code: "IP-18AN1E", group: "1", raw: "IP-18AN1E 1" },
    { code: "IP-18AN1G", group: "4", raw: "IP-18AN1G 4" },
  ]);
  assert.deepEqual(courseCodes({ code: "IP-18AN1E 1, IP-18AN1G 4" }), ["IP-18AN1E", "IP-18AN1G"]);
  assert.deepEqual(documentCourseCodes("Tárgykódok: IP-18AN1E, IP-18AN1G"), ["IP-18AN1E", "IP-18AN1G"]);
  assert.deepEqual(documentCourseCodes("Course code:\nIP-18AN1E\nSubject code: IP-18AN1G"), ["IP-18AN1E", "IP-18AN1G"]);
});
