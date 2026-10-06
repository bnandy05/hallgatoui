"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that toggles the popover; gets aria-expanded and aria-controls. */
  trigger: (props: { "aria-expanded": boolean; "aria-controls": string; onClick: () => void }) => ReactNode;
  label: string;
  children: ReactNode;
}

/**
 * A copy-paper sheet hanging from a header button. Closes on Escape and on a click outside;
 * focus moves into it on open and back to the button on Escape. On narrow screens it spans
 * the width under the header.
 */
export function Popover({ open, onOpenChange, trigger, label, children }: PopoverProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      rootRef.current?.querySelector<HTMLElement>("[aria-controls]")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ "aria-expanded": open, "aria-controls": id, onClick: () => onOpenChange(!open) })}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className="sheet-paper fixed inset-x-2 top-[calc(3.5rem+4px)] z-20 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain outline-none md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+8px)] md:w-[24rem]"
        >
          {children}
        </div>
      )}
    </div>
  );
}
