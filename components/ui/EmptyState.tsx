import type { ComponentType, ReactNode } from "react";

export interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text?: string;
  action?: ReactNode;
}

/** An empty spot on the board: a dashed outline where a sheet would go. */
export function EmptyState({ icon: Icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius)] border-2 border-dashed border-border-strong/60 px-6 py-14 text-center">
      <Icon className="h-8 w-8 text-muted-dim" />
      <h3 className="font-display text-[24px] text-heading">{title}</h3>
      {text && <p className="max-w-md text-[14.5px] text-muted">{text}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
