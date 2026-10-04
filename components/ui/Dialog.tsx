"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
  /** Focus the first text field on touch screens too (search, where typing is the whole task). */
  focusFieldOnTouch?: boolean;
}

/**
 * A copy-paper sheet over the page. Centred from sm up; on narrow screens a bottom sheet that
 * fills the width. The dialog itself scrolls: the title bar sticks to the top and a
 * `DialogActions` footer to the bottom, so Save is always reachable.
 */
export function Dialog({ open, onClose, title, children, size = "md", focusFieldOnTouch = false }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) {
        onClose();
      }
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={`sheet m-auto w-full overflow-y-auto overscroll-contain rounded-[var(--radius-slip)] bg-card p-0 text-foreground shadow-[0_24px_60px_-20px_rgba(20,28,34,0.5)] backdrop:bg-[rgba(40,48,54,0.45)] max-sm:mb-0 max-sm:max-h-[calc(100dvh-2.5rem)] max-sm:max-w-full max-sm:rounded-b-none sm:max-h-[calc(100dvh-3rem)] ${
        size === "lg" ? "sm:max-w-[min(42rem,calc(100vw-3rem))]" : "sm:max-w-[min(32rem,calc(100vw-3rem))]"
      }`}
    >
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-border bg-card py-2 pl-5 pr-3 sm:py-3">
        <h2 className="font-display min-w-0 text-[24px] text-heading [overflow-wrap:anywhere]">{title}</h2>
        <button
          type="button"
          aria-label="Bezárás"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-black/[0.06] hover:text-heading"
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
      className="sticky bottom-0 z-[1] -mx-5 mt-2 flex justify-end gap-2 border-t border-border bg-card px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 max-sm:[&>*]:flex-1"
    >
      {children}
    </div>
  );
}
