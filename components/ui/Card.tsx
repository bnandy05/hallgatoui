import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export type CardProps<T extends ElementType = "div"> = {
  as?: T;
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Card<T extends ElementType = "div">({
  as,
  interactive = false,
  className = "",
  children,
  ...props
}: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={`rounded-[var(--radius)] border border-border bg-card p-[22px] ${
        interactive ? "lift hover:border-accent" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
