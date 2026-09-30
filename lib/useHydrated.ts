import { useSyncExternalStore } from "react";

const noop = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
