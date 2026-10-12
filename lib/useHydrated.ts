import { useSyncExternalStore } from "react";

/** A subscribe function that never fires: for `useSyncExternalStore` reads that only differ server vs client. */
export const noop = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
