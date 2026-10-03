import type { ReactNode } from "react";

export interface PillProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Pill({ active = false, onClick, children, className = "", title }: PillProps) {
  const base = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${
    active
      ? "border-accent bg-accent-soft text-accent-text"
      : "border-border bg-card text-muted"
  } ${className}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={title}
        className={`${base} cursor-pointer transition-colors duration-150 hover:border-border-strong ${
          active ? "hover:border-accent" : ""
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
