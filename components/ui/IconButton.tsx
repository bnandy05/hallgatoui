import type { ButtonHTMLAttributes } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** What the button does; icon-only buttons have no other name. */
  "aria-label": string;
  tone?: "default" | "danger";
}

/** A square, icon-only button: 32px with a mouse, 44px under a thumb. */
export function IconButton({ tone = "default", className = "", type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-wash/[0.05] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11 ${
        tone === "danger" ? "hover:text-danger" : "hover:text-heading"
      } ${className}`}
      {...props}
    />
  );
}
