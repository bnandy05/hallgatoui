"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** "vertical" stacks the tabs from the lg breakpoint up; below it they scroll sideways. */
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export const tabId = (id: string) => `tab-${id}`;
export const panelId = (id: string) => `panel-${id}`;

/** ARIA tablist with roving focus (arrow keys, Home, End). Pair each panel with `TabPanel`. */
export function Tabs({
  items,
  value,
  onChange,
  label,
  orientation = "horizontal",
  className = "",
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const vertical = orientation === "vertical";

  function focusTab(index: number) {
    const item = items[(index + items.length) % items.length];
    onChange(item.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#${tabId(item.id)}`)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((i) => i.id === value);
    const next = vertical ? ["ArrowDown", "ArrowRight"] : ["ArrowRight"];
    const prev = vertical ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft"];
    if (next.includes(e.key)) focusTab(current + 1);
    else if (prev.includes(e.key)) focusTab(current - 1);
    else if (e.key === "Home") focusTab(0);
    else if (e.key === "End") focusTab(items.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onKeyDown={handleKeyDown}
      className={`flex gap-1 overflow-x-auto border-b border-felt-dark [scrollbar-width:none] ${
        vertical ? "lg:flex-col lg:gap-1 lg:overflow-visible lg:border-b-0" : ""
      } ${className}`}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            id={tabId(item.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId(item.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[14.5px] font-semibold transition-colors duration-150 ${
              active
                ? "border-accent text-heading"
                : "border-transparent text-muted hover:text-heading"
            } ${
              vertical
                ? `lg:mb-0 lg:rounded-[var(--radius)] lg:border-b-0 lg:px-3 lg:py-2 ${
                    active ? "lg:bg-card lg:shadow-[var(--shadow-paper)]" : "lg:hover:bg-card/60"
                  }`
                : ""
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`min-w-[1.4rem] rounded-full px-1.5 text-center text-[11.5px] tabular-nums ${
                  active ? "bg-accent text-accent-ink" : "bg-wash/[0.06] text-muted"
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
  className = "",
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(id)}
      aria-labelledby={tabId(id)}
      hidden={!active}
      tabIndex={0}
      className={`panel-in focus-visible:outline-offset-4 ${className}`}
    >
      {active && children}
    </div>
  );
}
