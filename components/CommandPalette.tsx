"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  ExternalLink,
  FileText,
  LayoutGrid,
  Search,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { useDataReady } from "@/lib/useDataReady";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";
import { DEADLINE_ANCHOR_EVENT } from "@/components/DeadlineAnchorScroll";
import { getPlatform } from "@/lib/platforms";
import { syncAllFeeds } from "@/lib/ical/client";
import {
  buildSearchItems,
  searchItems,
  type SearchItem,
  type SearchKind,
} from "@/lib/search";
import type { Platform } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { DeadlineDialog } from "@/components/DeadlineDialog";
import { PlatformIcon } from "@/components/PlatformIcon";

const KIND_ORDER: SearchKind[] = ["page", "action", "course", "link", "deadline", "resource"];

const KIND_ICONS: Record<SearchKind, LucideIcon> = {
  page: LayoutGrid,
  action: Zap,
  course: BookOpen,
  link: ExternalLink,
  deadline: CalendarClock,
  resource: FileText,
};

const subscribeNever = () => () => {};
const getIsMac = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export function CommandPalette() {
  const t = useT();
  const hydrated = useDataReady();
  const [open, setOpen] = useState(false);
  const [newDeadlineOpen, setNewDeadlineOpen] = useState(false);
  const [quickText, setQuickText] = useState("");
  const isMac = useSyncExternalStore(subscribeNever, getIsMac, () => false);

  useEffect(() => {
    if (!hydrated) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hydrated]);

  return (
    <>
      <button
        type="button"
        aria-label={t.palette.search}
        data-tour="search"
        onClick={() => setOpen(true)}
        disabled={!hydrated}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-2.5 text-small md:h-8 font-medium text-muted transition-colors hover:border-border-strong hover:text-heading sm:px-2.5"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">{t.palette.search}</span>
        <kbd className="hidden rounded-[var(--radius-badge)] bg-inset px-1.5 font-sans text-fine font-semibold text-muted lg:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t.palette.search} size="lg" focusFieldOnTouch>
        <PaletteContent
          onClose={() => setOpen(false)}
          onNewDeadline={(text) => {
            setQuickText(text);
            setNewDeadlineOpen(true);
          }}
        />
      </Dialog>
      <DeadlineDialog
        open={newDeadlineOpen}
        onClose={() => setNewDeadlineOpen(false)}
        initialQuickText={quickText || undefined}
      />
    </>
  );
}

function PaletteContent({
  onClose,
  onNewDeadline,
}: {
  onClose: () => void;
  onNewDeadline: (quickText: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const courses = useStore((s) => s.courses);
  const { visible: deadlines } = useDedupedDeadlines();
  const customPlatforms = useStore((s) => s.customPlatforms);
  const feeds = useStore((s) => s.feeds);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const allItems = useMemo(
    () => buildSearchItems({ courses, deadlines, customPlatforms, feeds, locale }),
    [courses, deadlines, customPlatforms, feeds, locale]
  );

  // Grouped by kind in a fixed order; the flat list drives keyboard navigation.
  const results = useMemo(() => {
    const text = query.trim();
    let found = searchItems(allItems, query);
    if (text) {
      // "Új határidő" always offers quick-add with the typed text, as the last action.
      found = found.filter((i) => i.actionId !== "new-deadline");
      found.push({
        id: "action:new-deadline",
        kind: "action",
        title: t.palette.newDeadline(text),
        actionId: "new-deadline",
      });
    }
    return KIND_ORDER.flatMap((kind) => found.filter((i) => i.kind === kind));
  }, [allItems, query, t]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function activate(item: SearchItem) {
    onClose();
    if (item.kind === "action") {
      if (item.actionId === "new-deadline") onNewDeadline(query.trim());
      else if (item.actionId === "sync-feeds") void syncAllFeeds();
      return;
    }
    if (!item.href) return;
    if (item.external) window.open(item.href, "_blank", "noopener,noreferrer");
    else {
      router.push(item.href);
      // A deadline on the page that is already open: DeadlineAnchorScroll looks for it again.
      if (item.kind === "deadline") window.dispatchEvent(new Event(DEADLINE_ANCHOR_EVENT));
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0 || e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) activate(item);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-dim"
        />
        <Input
        className="pl-9"
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-results"
        aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t.palette.placeholder}
        />
      </div>

      {results.length === 0 ? (
        <p className="py-6 text-center text-body text-muted">{t.palette.noResults}</p>
      ) : (
        <ul
          id="palette-results"
          ref={listRef}
          role="listbox"
          className="flex max-h-[max(8rem,min(50vh,calc(var(--visual-height,100dvh)-12.5rem)))] flex-col overflow-y-auto"
        >
          {results.map((item, index) => (
            <li key={item.id} role="presentation">
              {(index === 0 || results[index - 1].kind !== item.kind) && (
                <p className="px-2 pb-1 pt-3 text-fine font-semibold text-muted-dim">
                  {t.palette.kinds[item.kind]}
                </p>
              )}
              <div
                id={`palette-${item.id}`}
                role="option"
                aria-selected={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => activate(item)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius)] px-2 py-2 text-body ${
                  index === active ? "bg-canary" : ""
                }`}
              >
                <ItemIcon item={item} customPlatforms={customPlatforms} />
                <span className="min-w-0 truncate font-medium text-foreground">{item.title}</span>
                {item.subtitle && (
                  <span className="min-w-0 truncate text-fine text-muted">{item.subtitle}</span>
                )}
                {item.external && (
                  <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemIcon({
  item,
  customPlatforms,
}: {
  item: SearchItem;
  customPlatforms: Platform[];
}) {
  if (item.platformId) {
    return <PlatformIcon platform={getPlatform(item.platformId, customPlatforms)} size="sm" />;
  }
  if (item.color && item.kind === "course") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
      </span>
    );
  }
  const Icon = KIND_ICONS[item.kind];
  return <Icon className="h-5 w-5 shrink-0 p-0.5 text-muted" />;
}
