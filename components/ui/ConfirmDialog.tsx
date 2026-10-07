"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";

// A pinned confirmation sheet instead of the browser's confirm(): `ask` opens it and resolves to
// true only on the confirm button; Mégse, Esc, the backdrop and the close button all say no.
//
//   const [confirmDialog, ask] = useConfirm();
//   if (await ask({ title: "Törlöd a tárgyat?", confirmLabel: "Törlés" })) remove();
//   …
//   {confirmDialog}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  /** Destructive actions use the red button (the default); anything else the toner one. */
  tone?: "danger" | "primary";
}

export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((next: ConfirmOptions) => {
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <Dialog open={options !== null} onClose={() => finish(false)} title={options?.title ?? ""}>
      {options && (
        <div className="flex flex-col gap-4">
          {options.message && <div className="text-[14.5px] leading-relaxed text-foreground">{options.message}</div>}
          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => finish(false)}>
              Mégse
            </Button>
            <Button type="button" variant={options.tone === "primary" ? "primary" : "danger"} onClick={() => finish(true)}>
              {options.confirmLabel}
            </Button>
          </DialogActions>
        </div>
      )}
    </Dialog>
  );

  return [dialog, ask];
}
