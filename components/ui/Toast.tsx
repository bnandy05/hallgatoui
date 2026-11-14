"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { create } from "zustand";
import { useT } from "@/lib/i18n/I18nProvider";
import { IconButton } from "./IconButton";

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toast: (ToastOptions & { id: number }) | null;
  dismiss: () => void;
}

// Separate from the app store: transient, never persisted or synced.
const useToastStore = create<ToastState>((set) => ({
  toast: null,
  dismiss: () => set({ toast: null }),
}));

let nextId = 1;

/** Shows one toast at a time; a new one replaces the one on screen. */
export function showToast(options: ToastOptions) {
  useToastStore.setState({ toast: { ...options, id: nextId++ } });
}

const AUTO_DISMISS_MS = 6000;

/**
 * Mounted once in `AppShell`. A slip pinned in toner above the mobile tab bar (pinned up like any
 * `.slip`, a fade under reduced motion); stays while hovered or focused.
 */
export function ToastHost() {
  const t = useT();
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined || paused) return;
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [id, paused, dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6"
    >
      {toast && (
        <div
          key={toast.id}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          className="slip pointer-events-auto flex w-full max-w-md items-center gap-2 border border-border bg-card py-1.5 pl-4 pr-1.5"
        >
          <span aria-hidden="true" className="pin -top-[4px] left-[11px]" style={{ "--pin-color": "var(--accent)" } as CSSProperties} />
          <p className="min-w-0 flex-1 truncate text-body font-semibold text-heading">{toast.message}</p>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                dismiss();
              }}
              className="link-text inline-flex h-8 shrink-0 items-center rounded-[var(--radius)] px-2.5 text-body pointer-coarse:h-11"
            >
              {toast.actionLabel}
            </button>
          )}
          <IconButton aria-label={t.toast.dismiss} onClick={dismiss}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
