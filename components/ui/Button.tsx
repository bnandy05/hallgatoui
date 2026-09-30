import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export interface ButtonClassesOptions {
  variant?: Variant;
  size?: Size;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:opacity-90 focus-visible:outline-accent",
  secondary:
    "bg-card border border-border text-foreground hover:bg-border/40 focus-visible:outline-accent",
  ghost:
    "bg-transparent text-foreground hover:bg-border/40 focus-visible:outline-accent",
  danger:
    "bg-danger text-white hover:opacity-90 focus-visible:outline-danger",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-sm px-2.5 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: ButtonClassesOptions = {}): string {
  return `inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}
