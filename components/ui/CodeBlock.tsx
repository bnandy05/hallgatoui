"use client";

import { useEffect, useRef, useState } from "react";

export interface CodeBlockProps {
  children: string;
  prompt?: boolean;
  className?: string;
}

export function CodeBlock({ children, prompt = true, className = "" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context or denied): leave the label as is.
    }
  }

  return (
    <div
      className={`flex max-w-full flex-wrap items-start gap-2 rounded-[var(--radius-lg)] border border-border bg-inset px-4 py-3 text-sm text-foreground [overflow-wrap:anywhere] sm:flex-nowrap sm:items-center sm:gap-3.5 ${className}`}
    >
      <span className="min-w-0 flex-1">
        {prompt && (
          <span aria-hidden="true" className="text-accent">
            {"$ "}
          </span>
        )}
        {children}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Másolva" : "Másolás a vágólapra"}
        className={`ml-auto shrink-0 rounded-md border bg-transparent px-2.5 py-1 text-xs transition-colors duration-150 ${
          copied
            ? "border-success text-success"
            : "border-border text-muted hover:border-accent hover:text-foreground"
        }`}
      >
        {copied ? "Másolva!" : "Másolás"}
      </button>
    </div>
  );
}
