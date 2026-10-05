import type { Platform, ResourceKind } from "@/lib/types";

export const BUILT_IN_PLATFORMS: Platform[] = [
  { id: "neptun", name: "Neptun", color: "#1e3a8a", builtIn: true },
  { id: "teams", name: "Teams", color: "#5b5fc7", builtIn: true },
  { id: "canvas", name: "Canvas", color: "#e13f2b", builtIn: true },
  { id: "moodle", name: "Moodle", color: "#f98012", builtIn: true },
  { id: "tms", name: "TMS", color: "#0f766e", builtIn: true },
  { id: "discord", name: "Discord", color: "#5865f2", builtIn: true },
  { id: "messenger", name: "Messenger", color: "#0084ff", builtIn: true },
  { id: "drive", name: "Google Drive", color: "#1fa463", builtIn: true },
  { id: "egyeb", name: "Egyéb", color: "#6b7280", builtIn: true },
];

export function getPlatform(id: string | undefined, custom: Platform[]): Platform {
  if (!id) {
    return BUILT_IN_PLATFORMS.find((p) => p.id === "egyeb")!;
  }
  const builtIn = BUILT_IN_PLATFORMS.find((p) => p.id === id);
  if (builtIn) return builtIn;
  const found = custom.find((p) => p.id === id);
  if (found) return found;
  return BUILT_IN_PLATFORMS.find((p) => p.id === "egyeb")!;
}

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  jegyzet: "Jegyzet",
  zh: "Korábbi ZH",
  megoldas: "Mintamegoldás",
  video: "Videó",
  kovetelmeny: "Követelmény",
  egyeb: "Egyéb",
};

export const RESOURCE_KIND_COLORS: Record<ResourceKind, string> = {
  jegyzet: "#2563eb",
  zh: "#dc2626",
  megoldas: "#16a34a",
  video: "#9333ea",
  kovetelmeny: "#b45309",
  egyeb: "#6b7280",
};
