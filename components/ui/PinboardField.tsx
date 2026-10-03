"use client";

import { useEffect, useMemo, useRef } from "react";
import { useStore } from "@/lib/store";

// Neutral pin colours used when there are few (or no) open deadlines to seed from.
const FALLBACK_PINS = ["#9aa2a7", "#2b5b84", "#9aa2a7", "#d8352a"];
const PAPER = "rgba(253, 253, 250, 0.5)";
const PAPER_EDGE = "rgba(30, 40, 48, 0.06)";
const HOLE = "rgba(30, 40, 48, 0.16)";
const FPS = 30;
const SWAP_EVERY = 5200; // ms between one slip falling off and another being pinned up
const FALL_MS = 1700;
const PIN_MS = 700;
const CONTENT_MAX = 1240; // the page column; ghosts behind it are drawn much fainter
const IN_COLUMN_ALPHA = 0.3;

interface Ghost {
  x: number; // pin position
  y: number;
  w: number;
  h: number;
  base: number; // resting angle, radians
  sway: number; // sway amplitude, radians
  speed: number;
  phase: number;
  pin: string;
  /** Timestamp of the current phase start; state decides what it means. */
  since: number;
  state: "pinning" | "pinned" | "falling";
}

/** Small deterministic PRNG so the board looks the same across reloads for the same data. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

/**
 * The felt behind every page: faint ghost slips pinned up in the colours of the student's open
 * deadlines, swaying in a corridor draught. Every few seconds one falls off and another is
 * pinned up elsewhere. Static (one frame, no swaps) under reduced motion.
 */
export function PinboardField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deadlines = useStore((s) => s.deadlines);
  const courses = useStore((s) => s.courses);

  const { pins, seed } = useMemo(() => {
    const colorOf = new Map(courses.map((c) => [c.id, c.color]));
    const open = deadlines.filter((d) => !d.done);
    const list = open.map((d) => (d.courseId && colorOf.get(d.courseId)) || "#9aa2a7");
    return {
      pins: list.length > 0 ? list : FALLBACK_PINS,
      seed: hashString(open.map((d) => d.id).join("|") || "felt"),
    };
  }, [deadlines, courses]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rand = mulberry32(seed);
    let W = 0;
    let H = 0;
    let raf = 0;
    let last = 0;
    let nextSwap = performance.now() + SWAP_EVERY;
    let ghosts: Ghost[] = [];
    let holes: { x: number; y: number; r: number }[] = [];
    let pinIndex = 0;

    function makeGhost(now: number, state: Ghost["state"]): Ghost {
      const w = 64 + rand() * 70;
      return {
        x: rand() * W,
        y: 30 + rand() * (H - 60),
        w,
        h: w * (0.55 + rand() * 0.35),
        base: (rand() - 0.5) * 0.14,
        sway: 0.006 + rand() * 0.012,
        speed: 0.4 + rand() * 0.5,
        phase: rand() * Math.PI * 2,
        pin: pins[pinIndex++ % pins.length],
        since: now,
        state,
      };
    }

    function layout() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = (W * H) / (1440 * 900);
      const count = Math.round(Math.min(18, Math.max(7, pins.length)) * Math.min(1, Math.max(0.45, area)));
      const now = performance.now();
      ghosts = Array.from({ length: count }, () => makeGhost(now - PIN_MS, "pinned"));
      holes = Array.from({ length: Math.round(90 * Math.max(0.4, area)) }, () => ({
        x: rand() * W,
        y: rand() * H,
        r: 0.7 + rand() * 0.6,
      }));
    }

    function drawGhost(g: Ghost, now: number) {
      const t = now / 1000;
      let angle = g.base + Math.sin(t * g.speed + g.phase) * g.sway;
      let dy = 0;
      let alpha = 1;
      let pinScale = 1;
      if (g.state === "pinning") {
        const p = Math.min(1, (now - g.since) / PIN_MS);
        alpha = easeOut(p);
        dy = (1 - easeOut(p)) * -8;
        pinScale = 1 + (1 - easeOut(p)) * 0.6;
      } else if (g.state === "falling") {
        const p = Math.min(1, (now - g.since) / FALL_MS);
        angle += easeIn(p) * 0.9 * (g.base >= 0 ? 1 : -1);
        dy = easeIn(p) * 70;
        alpha = 1 - easeIn(p);
        pinScale = 0;
      }

      // Behind the page column the ghosts stay faint, so they never compete with text on the felt.
      const colLeft = Math.max(0, (W - CONTENT_MAX) / 2);
      const inColumn = g.x > colLeft - g.w / 2 && g.x < W - colLeft + g.w / 2;
      if (inColumn) alpha *= IN_COLUMN_ALPHA;

      ctx!.save();
      ctx!.globalAlpha = alpha;
      ctx!.translate(g.x, g.y + dy);
      ctx!.rotate(angle);
      // The slip hangs from a pin near its top centre.
      ctx!.shadowColor = "rgba(30, 40, 48, 0.10)";
      ctx!.shadowBlur = 8;
      ctx!.shadowOffsetY = 3;
      ctx!.fillStyle = PAPER;
      ctx!.fillRect(-g.w / 2, -6, g.w, g.h);
      ctx!.shadowColor = "transparent";
      ctx!.strokeStyle = PAPER_EDGE;
      ctx!.lineWidth = 1;
      ctx!.strokeRect(-g.w / 2 + 0.5, -5.5, g.w - 1, g.h - 1);
      // Two faint ruled "text" lines.
      ctx!.fillStyle = "rgba(30, 40, 48, 0.07)";
      ctx!.fillRect(-g.w / 2 + 10, 12, g.w * 0.55, 3);
      ctx!.fillRect(-g.w / 2 + 10, 21, g.w * 0.32, 3);
      ctx!.restore();

      // A coloured dot next to a line of text reads as a glitch: no pins behind the page column.
      if (pinScale > 0 && !inColumn) {
        ctx!.save();
        ctx!.globalAlpha = alpha * 0.8;
        ctx!.translate(g.x, g.y + dy);
        ctx!.scale(pinScale, pinScale);
        ctx!.fillStyle = g.pin;
        ctx!.beginPath();
        ctx!.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
    }

    function frame(now: number) {
      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = HOLE;
      for (const h of holes) {
        ctx!.beginPath();
        ctx!.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      for (const g of ghosts) drawGhost(g, now);
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < 1000 / FPS) return;
      last = now;

      if (now >= nextSwap && ghosts.length > 0) {
        nextSwap = now + SWAP_EVERY * (0.7 + rand() * 0.6);
        const pinned = ghosts.filter((g) => g.state === "pinned");
        const victim = pinned[Math.floor(rand() * pinned.length)];
        if (victim) {
          victim.state = "falling";
          victim.since = now;
        }
      }
      ghosts = ghosts.map((g) => {
        if (g.state === "falling" && now - g.since >= FALL_MS) {
          // A new slip goes up somewhere else; the hole the old pin left stays behind.
          holes.push({ x: g.x, y: g.y, r: 1.1 });
          if (holes.length > 160) holes.shift();
          return makeGhost(now, "pinning");
        }
        if (g.state === "pinning" && now - g.since >= PIN_MS) return { ...g, state: "pinned" };
        return g;
      });
      frame(now);
    }

    layout();
    if (reduced) {
      frame(performance.now());
    } else {
      raf = requestAnimationFrame(tick);
    }

    function onResize() {
      layout();
      if (reduced) frame(performance.now());
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [pins, seed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
