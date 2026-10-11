"use client";

import type { CSSProperties } from "react";
import { Compass } from "lucide-react";
import { enterDemo } from "@/lib/demoMode";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

/** Under the sign-in form: look around with sample data before registering. */
export function DemoEntry() {
  const t = useT();
  return (
    <div className="slip mt-8 flex flex-col gap-3 bg-card px-5 pb-5 pt-6">
      <span aria-hidden="true" className="pin -top-[4px] left-5" style={{ "--pin-color": "var(--pin-neutral)" } as CSSProperties} />
      <h2 className="font-display text-[22px] text-heading">{t.demo.signInTitle}</h2>
      <p className="text-[14px] text-muted">{t.demo.signInText}</p>
      <Button type="button" variant="secondary" className="w-fit" onClick={enterDemo}>
        <Compass className="h-4 w-4" aria-hidden="true" />
        {t.demo.start}
      </Button>
    </div>
  );
}
