export const COURSE_COLORS: string[] = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
];

export function pickCourseColor(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}
