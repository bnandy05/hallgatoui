import {
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
  moodle: GraduationCap,
  neptun: Landmark,
  tms: Upload,
  messenger: MessageCircle,
  egyeb: LinkIcon,
};

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
};

const ICON_SIZE: Record<"sm" | "md", string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
};

export interface PlatformIconProps {
  platform: Platform;
  size?: "sm" | "md";
}

export function PlatformIcon({ platform, size = "sm" }: PlatformIconProps) {
  const Icon = ICONS[platform.id];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${SIZE_CLASSES[size]}`}
      style={{ backgroundColor: platform.color }}
      aria-hidden="true"
    >
      {Icon ? (
        <Icon className={ICON_SIZE[size]} />
      ) : (
        <span className={size === "sm" ? "text-[10px]" : "text-xs"}>
          {platform.name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
