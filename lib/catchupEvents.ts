// Opening the catch-up popup from anywhere (the reminders, the course page) without prop
// drilling: a window event that CatchUpGate listens to.

const EVENT = "hr:catchup-open";

export interface CatchUpOpenDetail {
  /** Only this group (a class or deadline); all pending ones when absent. */
  groupKey?: string;
}

export function openCatchUp(detail: CatchUpOpenDetail = {}): void {
  window.dispatchEvent(new CustomEvent<CatchUpOpenDetail>(EVENT, { detail }));
}

export function onCatchUpOpen(handler: (detail: CatchUpOpenDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<CatchUpOpenDetail>).detail ?? {});
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
