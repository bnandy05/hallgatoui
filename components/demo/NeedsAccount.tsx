"use client";

import type { CSSProperties, ReactNode } from "react";
import { Lock } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";

/** The demo's "Needs an account" stamp, on canary paper (the highlight colour). */
export function NeedsAccountStamp({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-[var(--radius-badge)] bg-canary px-1.5 py-px text-fine font-semibold text-heading ${className}`}
    >
      <Lock className="h-3 w-3" aria-hidden="true" />
      {t.demo.needsAccount}
    </span>
  );
}

/** In the demo, stands in for a feature that needs an account: what it does, and the stamp. Without a
 * `title` it sits under the section's own heading. */
export function DemoLocked({ title, text, children, tour }: { title?: string; text: string; children?: ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className="slip flex flex-col gap-3 bg-card px-5 pb-5 pt-6">
      <span aria-hidden="true" className="pin -top-[4px] left-5" style={{ "--pin-color": "var(--pin-neutral)" } as CSSProperties} />
      <NeedsAccountStamp />
      {title && <h2 className="font-display text-subhead text-heading">{title}</h2>}
      <p className="max-w-[62ch] text-body text-muted">{text}</p>
      {children}
    </section>
  );
}
