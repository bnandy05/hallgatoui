import type { ComponentType, ReactNode } from "react";

export interface EyebrowProps {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}

export function Eyebrow({ icon: Icon, children, className = "" }: EyebrowProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent-text ${className}`}
    >
      <span aria-hidden="true" className="text-accent-2">
        §
      </span>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </span>
  );
}
