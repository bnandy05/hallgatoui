"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { budapestParts } from "@/lib/ical/budapest";
import { borderlinePairs, deadlineSourceKey, pairKey } from "@/lib/ical/dedupe";
import { judgeDuplicates } from "@/lib/suggest/client";
import { MAX_SUGGEST_ITEMS } from "@/lib/suggest/questions";
import type { Deadline, IcalFeed } from "@/lib/types";

// Asks Jev about the duplicate pairs the title rules can't settle ("1. zárthelyi" from Neptun,
// "ZH1" from Canvas, same course and day). Pairs with similar titles merge without asking, and
// clearly different ones are never asked. A "same" answer is stored as a confirmation in the data
// document, so every device and the calendar export see it; every pair is asked once per device
// (and the server caches the answer for everyone). Only upcoming deadlines are worth a question.

const ASKED_KEY = "hallgatoireteg-jev-duplicates";
const MAX_ASKED = 3000;
const DELAY_MS = 4000;

function readAsked(): Set<string> {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeAsked(asked: Set<string>) {
  try {
    localStorage.setItem(ASKED_KEY, JSON.stringify([...asked].slice(-MAX_ASKED)));
  } catch {
    // storage full or blocked: the pair is asked again later (a server cache hit)
  }
}

function side(d: Deadline, feeds: IcalFeed[]) {
  const { hour, minute } = budapestParts(new Date(d.due));
  const allDay = hour === 23 && minute === 59;
  return {
    title: d.title,
    source: deadlineSourceKey(d, feeds),
    time: allDay ? "all day" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function DuplicateCheck() {
  const deadlines = useStore((s) => s.deadlines);
  const pairs = useStore((s) => s.ignoredDuplicatePairs);
  const courses = useStore((s) => s.courses);
  const enabled = useStore((s) => s.exportOptions.dedupe);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      if (busy.current) return;
      const now = Date.now();
      const asked = readAsked();
      const todo = borderlinePairs(deadlines, pairs, courses)
        .filter(([a, b]) => !asked.has(pairKey(a, b)))
        .filter(([a, b]) => Math.max(new Date(a.due).getTime(), new Date(b.due).getTime()) >= now - 24 * 3600 * 1000)
        .slice(0, MAX_SUGGEST_ITEMS);
      if (todo.length === 0) return;
      busy.current = true;
      const { feeds } = useStore.getState();
      void judgeDuplicates(todo.map(([a, b]) => ({ a: side(a, feeds), b: side(b, feeds) })))
        .then((verdicts) => {
          if (verdicts === null) return; // not reachable now (offline, no key, limit): try later
          const same: [string, string][] = [];
          todo.forEach(([a, b], i) => {
            asked.add(pairKey(a, b));
            if (verdicts[i] === true) same.push([a.id, b.id]);
          });
          writeAsked(asked);
          if (same.length) useStore.getState().confirmDuplicates(same);
        })
        .finally(() => {
          busy.current = false;
        });
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [deadlines, pairs, courses, enabled]);

  return null;
}
