"use client";

import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
import type { CourseLink } from "@/lib/types";
import { PlatformIcon } from "@/components/PlatformIcon";

export interface LinkButtonProps {
  link: CourseLink;
}

export function LinkButton({ link }: LinkButtonProps) {
  const customPlatforms = useStore((s) => s.customPlatforms);
  const platform = getPlatform(link.platformId, customPlatforms);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.url}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <PlatformIcon platform={platform} size="sm" />
      <span className="truncate">{link.label || platform.name}</span>
    </a>
  );
}
