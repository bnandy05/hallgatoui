import type { ReactNode } from "react";

export interface BadgeProps {
  color: string; // hex, or a CSS colour token such as var(--danger)
  children: ReactNode;
  className?: string;
}

export function Badge({ color, children, className = "" }: BadgeProps) {
  // color-mix keeps the tint working for both hex values and var() tokens.
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {children}
    </span>
  );
}
