"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
}

export function Dialog({ open, onClose, title, children, size = "md" }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the close button; a dialog with a form starts on its first text field
      // instead (React's autoFocus runs before the dialog is open, so it can't do this itself).
      dialog
        .querySelector<HTMLElement>(
          "[data-dialog-body] :is(input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea):not([disabled])"
        )
        ?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

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
      className={`sheet m-auto max-h-[calc(100vh-2rem)] w-full ${
        size === "lg" ? "max-w-[min(42rem,calc(100vw-2rem))]" : "max-w-[min(32rem,calc(100vw-2rem))]"
      } overflow-y-auto rounded-[var(--radius-slip)] bg-card p-0 text-foreground shadow-[0_24px_60px_-20px_rgba(20,28,34,0.5)] backdrop:bg-[rgba(40,48,54,0.45)]`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="font-display text-[24px] text-heading">{title}</h2>
        <button
          type="button"
          aria-label="Bezárás"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-black/[0.06] hover:text-heading"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Mount children only while open so forms re-initialise on every open. */}
      <div data-dialog-body className="px-5 py-5">
        {open && children}
      </div>
    </dialog>
  );
}
