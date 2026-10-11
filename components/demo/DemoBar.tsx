"use client";

import { useEffect } from "react";
import { Compass, LogOut } from "lucide-react";
import { DEMO_USER_ID, leaveDemo, registerFromDemo } from "@/lib/demoMode";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { openDemoTour } from "@/components/demo/DemoTour";

/**
 * The strip under the header while in the demo; also seeds the sample data the first time (and
 * again when the tab's copy belongs to anything other than the demo).
 */
export function DemoBar() {
  const t = useT();
  const locale = useLocale();
  const owned = useStore((s) => s.ownerUserId === DEMO_USER_ID && s.account?.userId === DEMO_USER_ID);
  const startDemo = useStore((s) => s.startDemo);

  useEffect(() => {
    if (!owned) startDemo(locale);
  }, [owned, startDemo, locale]);

  return (
    <div className="border-b border-felt-dark bg-canary-soft">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <p className="min-w-0 basis-full text-small text-foreground sm:flex-1 sm:basis-0">
          <span className="font-semibold text-heading md:hidden">{t.demo.bannerShort}</span>
          <span className="hidden md:inline">{t.demo.banner}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={openDemoTour}>
            <Compass className="h-4 w-4" aria-hidden="true" />
            {t.demo.tour}
          </Button>
          <Button type="button" size="sm" onClick={registerFromDemo}>
            {t.demo.register}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => leaveDemo()} aria-label={t.demo.exit} title={t.demo.exit}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t.demo.exitShort}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
