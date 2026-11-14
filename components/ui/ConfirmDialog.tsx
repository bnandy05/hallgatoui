"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button, buttonClasses } from "./Button";
import { Dialog, DialogActions } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  /** `danger` pins the sheet with the red pin and prints the confirm button in danger ink. */
  tone?: "danger" | "default";
  busy?: boolean;
}

/**
 * A pinned question before something that cannot be taken back. Cancel has the focus on
 * pointer devices, so Enter never destroys by accident; Escape and the backdrop cancel.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose} title={title} pinColor={tone === "danger" ? "var(--pin)" : undefined}>
      {message && <div className="text-body text-foreground">{message}</div>}
      <DialogActions>
        <CancelButton onClick={onClose} disabled={busy}>
          {cancelLabel ?? t.common.cancel}
        </CancelButton>
        <Button type="button" variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CancelButton({ children, ...props }: { children: ReactNode; onClick: () => void; disabled: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The parent Dialog opens the sheet in its own effect (which focuses the close button), so
    // move the focus after it.
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const id = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <button ref={ref} type="button" className={buttonClasses({ variant: "secondary" })} {...props}>
      {children}
    </button>
  );
}

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "danger" | "default";
}

/**
 * `const { confirm, dialog } = useConfirm()`: render `{dialog}` once, then
 * `if (await confirm({ title, message, confirmLabel, tone: "danger" })) …`.
 * Resolves `false` on cancel, Escape or backdrop.
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    // Let the native dialog restore focus before the caller can close its own dialog.
    flushSync(() => setOpen(false));
    resolve?.(value);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  const dialog = options ? (
    <ConfirmDialog
      open={open}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      tone={options.tone ?? "danger"}
    />
  ) : null;

  return { confirm, dialog };
}
