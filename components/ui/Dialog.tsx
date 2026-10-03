"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
      className={`max-h-[calc(100vh-2rem)] w-full ${
        size === "lg" ? "max-w-[min(42rem,calc(100vw-2rem))]" : "max-w-[min(32rem,calc(100vw-2rem))]"
      } overflow-y-auto rounded-[var(--radius)] border border-border bg-card p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-bold text-heading">{title}</h2>
        <button
          type="button"
          aria-label="Bezárás"
          onClick={onClose}
          className="inline-flex h-5 w-7 items-center justify-center rounded text-xs text-muted transition-colors hover:bg-[#c0392b] hover:text-white"
        >
          ✕
        </button>
      </div>
      {/* Mount children only while open so forms re-initialise on every open. */}
      <div className="px-4 py-4">{open && children}</div>
    </dialog>
  );
}
