import type { ReactNode } from "react";

export interface BadgeProps {
  color: string; // hex
  children: ReactNode;
  className?: string;
}

export function Badge({ color, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: color + "1a", color }}
    >
      {children}
    </span>
  );
}
