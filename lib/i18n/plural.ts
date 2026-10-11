/** English-style plural choice; Hungarian dictionary functions simply ignore the count. */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}
