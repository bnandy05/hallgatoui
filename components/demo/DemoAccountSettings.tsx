"use client";

import { LogOut, RotateCcw } from "lucide-react";
import { leaveDemo, registerFromDemo } from "@/lib/demoMode";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { DemoLocked } from "@/components/demo/NeedsAccount";

/** The Fiók tab in the demo: what an account adds, and the demo's own controls. */
export function DemoAccountSettings() {
  const t = useT();
  const locale = useLocale();
  const startDemo = useStore((s) => s.startDemo);
  return (
    <DemoLocked tour="account" title={t.demo.locked.account.title} text={t.demo.locked.account.text}>
      <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
        <Button type="button" onClick={registerFromDemo}>
          {t.demo.register}
        </Button>
        <Button type="button" variant="secondary" onClick={() => startDemo(locale)}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t.demo.reset}
        </Button>
        <Button type="button" variant="ghost" onClick={() => leaveDemo()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t.demo.exit}
        </Button>
      </div>
    </DemoLocked>
  );
}
