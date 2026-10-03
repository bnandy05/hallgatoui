import { readFileSync } from "node:fs";

/** Reads `fixtures/ical/<name>`. */
export function readFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/ical/${name}`, import.meta.url), "utf8");
}
