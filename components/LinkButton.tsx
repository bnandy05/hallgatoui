"use client";

import { useStore } from "@/lib/store";
import { getPlatform } from "@/lib/platforms";
import type { CourseLink } from "@/lib/types";
import { PlatformIcon } from "@/components/PlatformIcon";

export interface LinkButtonProps {
  link: CourseLink;
  size?: "sm" | "md";
}

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "gap-1.5 px-2 py-1 text-xs",
  md: "gap-2 px-3 py-2 text-sm",
};

export function LinkButton({ link, size = "sm" }: LinkButtonProps) {
  const customPlatforms = useStore((s) => s.customPlatforms);
  const platform = getPlatform(link.platformId, customPlatforms);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.url}
      className={`inline-flex max-w-full items-center rounded-md border border-border bg-card font-medium text-foreground hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-accent ${SIZE_CLASSES[size]}`}
    >
      <PlatformIcon platform={platform} size={size} />
      <span className="truncate">{link.label || platform.name}</span>
    </a>
  );
}
