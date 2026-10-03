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
    "bg-[linear-gradient(135deg,var(--accent),var(--accent-deep))] border border-accent-text font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_10px_rgba(255,194,61,0.18)] hover:brightness-[1.07] hover:shadow-[var(--glow-accent)] lift-sm",
  secondary:
    "bg-inset border border-border text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-accent lift-sm",
  ghost: "bg-transparent text-foreground hover:bg-inset",
  danger:
    "bg-danger border border-danger font-semibold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] hover:brightness-[1.07] lift-sm focus-visible:outline-danger",
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
  return `inline-flex items-center justify-center rounded-[var(--radius-lg)] font-medium transition-[background-color,border-color,filter,box-shadow,transform] duration-150 ease-[var(--ease-out)] disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}
