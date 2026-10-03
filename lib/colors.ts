// Pushpin colours. Red is left out on purpose: the red pin means "now" and "critical".
export const COURSE_COLORS: string[] = [
  "#2f5bd3", // cobalt
  "#2e8b57", // green
  "#e2a900", // yellow
  "#e06c1f", // orange
  "#7a4fc9", // violet
  "#12858a", // teal
  "#d24b8b", // pink
  "#3b4148", // graphite
];

export function pickCourseColor(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}
