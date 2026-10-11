"use client";

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useStore } from "@/lib/store";
import { useDuplicateCopies } from "@/lib/useDedupedDeadlines";
import { getPlatform, platformName } from "@/lib/platforms";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Deadline } from "@/lib/types";
import { Pill } from "@/components/ui/Pill";
import { PlatformIcon } from "@/components/PlatformIcon";

/**
 * "+N sources" pill on a deadline that other sources also report. Expands inline into the other
 * copies, each with a "Not a duplicate" button. Renders nothing when there are no copies.
 */
export function DuplicateSources({ deadline, small = false }: { deadline: Deadline; small?: boolean }) {
  const t = useT();
  const copies = useDuplicateCopies(deadline.id);
  const feeds = useStore((s) => s.feeds);
  const customPlatforms = useStore((s) => s.customPlatforms);
  const ignoreDuplicate = useStore((s) => s.ignoreDuplicate);
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (copies.length === 0) return null;

  return (
    <>
      <Pill
        active={open}
        onClick={() => setOpen((v) => !v)}
        expanded={open}
        controls={listId}
        title={t.duplicates.pillTitle}
        className={small ? "!px-1.5 !py-0 !text-[10.5px]" : "!px-2 !py-0 !text-[11px]"}
      >
        {t.duplicates.pill(copies.length)}
      </Pill>
      {open && (
        <ul
          id={listId}
          aria-label={t.duplicates.listLabel}
          className="mt-1 flex w-full basis-full flex-col gap-1 rounded-[var(--radius)] border border-border/70 bg-card p-1.5"
        >
          {copies.map((copy) => {
            const feed = copy.feedId ? feeds.find((f) => f.id === copy.feedId) : undefined;
            const platform = getPlatform(feed?.platformId ?? copy.platformId, customPlatforms);
            const name = copy.source === "manual" ? t.duplicates.manual : platformName(platform, t.platforms.other);
            return (
              <li key={copy.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <PlatformIcon platform={platform} size="sm" />
                <span className="font-medium text-foreground">{name}</span>
                {copy.url && (
                  <a
                    href={copy.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.duplicates.openSource(name)}
                    className="text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => ignoreDuplicate(deadline.id, copy.id)}
                  className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10.5px] text-muted hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {t.duplicates.notDuplicate}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
