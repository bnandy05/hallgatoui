import {
  BookOpen,
  FolderOpen,
  GraduationCap,
  Landmark,
  Link as LinkIcon,
  MessageCircle,
  MessagesSquare,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Platform } from "@/lib/types";

const ICONS: Record<string, LucideIcon> = {
  teams: Video,
  discord: MessagesSquare,
  drive: FolderOpen,
  canvas: GraduationCap,
  moodle: BookOpen,
  neptun: Landmark,
  tms: Upload,
  messenger: MessageCircle,
  egyeb: LinkIcon,
};

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "h-5 w-5 rounded-[var(--radius-badge)] border",
  md: "h-7 w-7 rounded-[var(--radius)] border-[1.5px]",
};

const ICON_SIZE: Record<"sm" | "md", string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
};

export interface PlatformIconProps {
  platform: Platform;
  size?: "sm" | "md";
}

/**
 * A platform's mark as a rubber stamp on the paper, like `Badge`: an ink outline and an ink
 * glyph in the platform colour, no fill, so it sits on copy paper, sky or salmon alike.
 */
export function PlatformIcon({ platform, size = "sm" }: PlatformIconProps) {
  const Icon = ICONS[platform.id];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold leading-none ${SIZE_CLASSES[size]}`}
      style={{
        borderColor: `color-mix(in srgb, ${platform.color} 55%, transparent)`,
        color: `color-mix(in srgb, ${platform.color} var(--stamp-ink), var(--stamp-mix))`,
      }}
      aria-hidden="true"
    >
      {Icon ? (
        <Icon className={ICON_SIZE[size]} strokeWidth={size === "sm" ? 2.25 : 2} />
      ) : (
        <span className={size === "sm" ? "text-fine" : "text-body"}>
          {platform.name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
