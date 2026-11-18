"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { attendanceGroups } from "@/lib/attendance";

export function useAttendance(courseId?: string) {
  const courses = useStore((s) => s.courses);
  const sessions = useStore((s) => s.classSessions);
  const rules = useStore((s) => s.requirementRules);
  const results = useStore((s) => s.requirementResults);
  const semester = useStore((s) => s.semester);
  const attendancePrefs = useStore((s) => s.attendancePrefs);
  return useMemo(() => attendanceGroups({ courses: courseId ? courses.filter((c) => c.id === courseId) : courses,
    sessions, rules, results, semester, attendancePrefs }), [courses, sessions, rules, results, semester, attendancePrefs, courseId]);
}
