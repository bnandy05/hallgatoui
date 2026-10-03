import type { ReactNode } from "react";

export interface BadgeProps {
  color: string; // hex, or a CSS colour token such as var(--danger)
  children: ReactNode;
  className?: string;
}

/** A small stamped label: tinted fill, text in the colour mixed towards ink for contrast. */
export function Badge({ color, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[3px] px-1.5 py-px text-[11.5px] font-semibold ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: `color-mix(in srgb, ${color} 72%, #000)`,
      }}
    >
      {children}
    </span>
  );
}
