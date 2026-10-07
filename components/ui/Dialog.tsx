"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  /** Focus the first text field on touch screens too (search, where typing is the whole task). */
  focusFieldOnTouch?: boolean;
  /** Pin the sheet up: a pushpin head in this colour beside the title (a deadline's state). */
  pinColor?: string;
  /** The paper the sheet is printed on: salmon for an overdue deadline. */
  tone?: "paper" | "salmon";
  /**
   * A dialog with steps: the name of the step on show. Changing it starts the new step at the
   * top, and coming back to a step returns to where it was scrolled.
   */
  view?: string;
}

/**
 * A copy-paper sheet over the page. Centred from sm up; on narrow screens a bottom sheet that
 * fills the width. The dialog itself scrolls: the title bar sticks to the top and a
 * `DialogActions` footer to the bottom, so Save is always reachable. The sheet is laid out in
 * the visible part of the screen (`KeyboardInset`), so the on-screen keyboard never covers it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
  focusFieldOnTouch = false,
  pinColor,
  tone = "paper",
  view,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrolls = useRef(new Map<string, number>());
  const shownView = useRef(view);

  // Each step's scroll position is kept as it goes (by the time a new step renders, the old one is
  // already gone and the browser has clamped the position); the shown step is restored in layout,
  // so it never flashes.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const remember = () => {
      if (shownView.current !== undefined) scrolls.current.set(shownView.current, dialog.scrollTop);
    };
    // A step changes on a click or a key press inside the sheet: record the position before the
    // handler runs too, since scroll events only arrive with the next frame.
    dialog.addEventListener("scroll", remember, { passive: true });
    dialog.addEventListener("click", remember, true);
    dialog.addEventListener("keydown", remember, true);
    return () => {
      dialog.removeEventListener("scroll", remember);
      dialog.removeEventListener("click", remember, true);
      dialog.removeEventListener("keydown", remember, true);
    };
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || shownView.current === view) return;
    shownView.current = view;
    dialog.scrollTop = (view !== undefined && scrolls.current.get(view)) || 0;
  }, [view]);

  useEffect(() => {
    if (!open) scrolls.current.clear();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.scrollTop = 0;
      // showModal() focuses the close button; with a mouse, a dialog with a form starts on its
      // first text field instead (React's autoFocus runs before the dialog is open). Touch
      // screens keep the close button, so the keyboard doesn't cover the sheet on open.
      if (focusFieldOnTouch || window.matchMedia("(pointer: fine)").matches) {
        dialog
          .querySelector<HTMLElement>(
            "[data-dialog-body] :is(input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea):not([disabled])"
          )
          ?.focus();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, focusFieldOnTouch]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    // The backdrop closes the sheet only when the press started on it too: selecting text in a
    // field and letting go past the sheet's edge must not throw the form away.
    let pressedBackdrop = false;
    const handlePointerDown = (event: PointerEvent) => {
      pressedBackdrop = event.target === dialog;
    };
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog && pressedBackdrop) onClose();
      pressedBackdrop = false;
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      style={{ "--sheet": tone === "salmon" ? "var(--salmon)" : "var(--panel)" } as CSSProperties}
      className={`sheet top-[var(--visual-top,0px)] bottom-[var(--keyboard-inset,0px)] m-auto w-full scroll-pt-16 overflow-y-auto overscroll-contain has-[[data-dialog-actions]]:scroll-pb-20 rounded-[var(--radius-slip)] bg-[var(--sheet)] p-0 text-foreground shadow-[var(--shadow-dialog)] backdrop:bg-[var(--backdrop,rgba(40,48,54,0.45))] max-sm:mb-0 max-sm:max-h-[calc(var(--visual-height,100dvh)-2.5rem)] max-sm:max-w-full max-sm:rounded-b-none sm:max-h-[calc(var(--visual-height,100dvh)-3rem)] ${
        size === "xl"
          ? "sm:max-w-[min(66rem,calc(100vw-3rem))]"
          : size === "lg"
            ? "sm:max-w-[min(42rem,calc(100vw-3rem))]"
            : "sm:max-w-[min(32rem,calc(100vw-3rem))]"
      }`}
    >
      <div
        className={`sticky top-0 z-[1] flex items-start justify-between gap-3 border-b border-border bg-[var(--sheet)] py-2 pr-3 sm:py-3 ${
          pinColor ? "pl-11" : "pl-5"
        }`}
      >
        {pinColor && (
          <span
            aria-hidden="true"
            className="pin left-5 top-[20px] !h-[13px] !w-[13px] sm:top-[24px]"
            style={{ "--pin-color": pinColor } as CSSProperties}
          />
        )}
        <h2 className="font-display min-w-0 self-center py-1.5 text-[24px] text-heading [overflow-wrap:anywhere]">{title}</h2>
        <button
          type="button"
          aria-label="Bezárás"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-wash/[0.06] hover:text-heading"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {/* Mount children only while open so forms re-initialise on every open. */}
      <div data-dialog-body className="px-5 pb-6 pt-5 has-[[data-dialog-actions]]:pb-0">
        {open && children}
      </div>
    </dialog>
  );
}

/** The dialog's Cancel / Save row: stuck to the bottom of the sheet while the form scrolls. */
export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <div
      data-dialog-actions
      className="sticky bottom-0 z-[1] -mx-5 mt-2 flex flex-wrap justify-end gap-2 border-t border-border bg-[var(--sheet)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 max-sm:[&>*]:flex-1"
    >
      {children}
    </div>
  );
}
