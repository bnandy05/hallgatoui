import type { ComponentType, ReactNode } from "react";

export interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-muted" />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
