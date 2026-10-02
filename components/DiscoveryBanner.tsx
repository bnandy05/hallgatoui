"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { groupContexts, pendingContexts } from "@/lib/ical/discover";
import { Button } from "@/components/ui/Button";
import { DiscoveryDialog } from "@/components/DiscoveryDialog";

export function DiscoveryBanner() {
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
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
        <Sparkles className="h-5 w-5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {groupCount} új tárgyat találtunk a naptáradban
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Áttekintés
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            <span className="text-muted">Később</span>
          </Button>
        </div>
      </div>
      <DiscoveryDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
