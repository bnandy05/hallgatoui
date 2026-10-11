"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { groupContexts, pendingContexts } from "@/lib/ical/discover";
import { Button } from "@/components/ui/Button";
import { DiscoveryDialog } from "@/components/DiscoveryDialog";

export function DiscoveryBanner() {
  const t = useT();
  const feeds = useStore((s) => s.feeds);
  const courses = useStore((s) => s.courses);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const groupCount = useMemo(
    () => groupContexts(pendingContexts(feeds, courses)).length,
    [feeds, courses]
  );

  if (groupCount === 0 || (dismissed && !open)) {
    return null;
  }

  return (
    <>
      <div className="slip flex flex-wrap items-center gap-3 bg-canary py-3 pl-9 pr-4">
        <span aria-hidden="true" className="pin left-3.5 top-1/2 -mt-[5.5px]" />
        <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[14.5px] font-semibold text-heading">
          {t.banners.newCourses(groupCount)}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            {t.banners.review}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            {t.common.later}
          </Button>
        </div>
      </div>
      <DiscoveryDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
