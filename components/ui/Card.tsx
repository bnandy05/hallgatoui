import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export type CardProps<T extends ElementType = "div"> = {
  as?: T;
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/** A sheet of copy paper on the felt. */
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
      className={`sheet-paper p-5 sm:p-6 ${
        interactive ? "transition-shadow duration-200 hover:shadow-[var(--shadow-lift)]" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
