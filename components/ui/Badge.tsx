import type { ReactNode } from "react";

export interface BadgeProps {
  color: string; // hex, or a CSS colour token such as var(--danger)
  children: ReactNode;
  className?: string;
}

/** A small rubber-stamped label: an ink outline and ink text in the colour, no fill. */
export function Badge({ color, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-badge)] border px-1.5 py-px text-fine font-semibold ${className}`}
      style={{
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
        color: `color-mix(in srgb, ${color} var(--stamp-ink), var(--stamp-mix))`,
      }}
    >
      {children}
    </span>
  );
}
