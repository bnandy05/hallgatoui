"use client";

import { useState, type ReactNode } from "react";

export interface TerminalProps {
  title: string;
  children: ReactNode;
  cursor?: boolean;
  className?: string;
}

/** A line prefixed with the coral `> ` prompt. */
export function TerminalLine({ prompt = false, children }: { prompt?: boolean; children: ReactNode }) {
  return (
    <div>
      {prompt && (
        <span aria-hidden="true" className="text-accent">
          {"> "}
        </span>
      )}
      {children}
    </div>
  );
}

export function Terminal({ title, children, cursor = false, className = "" }: TerminalProps) {
  const [closed, setClosed] = useState(false);

  if (closed) {
    return (
      <button
        type="button"
        onClick={() => setClosed(false)}
        aria-label="Terminál megnyitása"
        className={`self-start rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent-text ${className}`}
      >
        [ terminál megnyitása ]
      </button>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[var(--radius)] border border-border bg-inset shadow-[0_24px_60px_rgba(0,0,0,0.4)] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border bg-[#20242c] py-[5px] pl-3 pr-1.5">
        <span className="truncate text-xs text-muted">{title}</span>
        <button
          type="button"
          aria-label="Terminál bezárása"
          onClick={() => setClosed(true)}
          className="inline-flex h-5 w-7 shrink-0 items-center justify-center rounded text-xs leading-none text-muted transition-colors hover:bg-[#c0392b] hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="whitespace-pre-wrap px-4 py-[18px] text-[13.5px] leading-[1.7] text-foreground">
        {children}
        {cursor && (
          <span aria-hidden="true" className="term-cursor">
            |
          </span>
        )}
      </div>
    </div>
  );
}
