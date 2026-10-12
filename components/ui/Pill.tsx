import type { ReactNode } from "react";

export interface PillProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  /** For pills that open something: sets aria-expanded (instead of aria-pressed). */
  expanded?: boolean;
  controls?: string;
}

export function Pill({ active = false, onClick, children, className = "", title, expanded, controls }: PillProps) {
  const base = `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small font-medium ${
    active
      ? "border-accent bg-accent text-accent-ink"
      : "border-border bg-card text-muted"
  } ${className}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        {...(expanded === undefined ? { "aria-pressed": active } : { "aria-expanded": expanded, "aria-controls": controls })}
        title={title}
        className={`${base} cursor-pointer transition-colors duration-150 ${
          active ? "hover:bg-accent-hover" : "hover:border-border-strong hover:text-heading"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={base} title={title}>
      {children}
    </span>
  );
}
