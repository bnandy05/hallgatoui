"use client";

import { useEffect, useRef } from "react";

// Colours for the traces (chalk, highlighter yellow, chalk mint). Trails fade by erasing alpha,
// so the canvas stays transparent over the graph-paper page background.
const COLORS = ["#d6e2f0", "#d6e2f0", "#d6e2f0", "#ffc23d", "#5ee0b8"];
const GRID = 24; // must match the CSS minor grid in globals.css
const TRACERS = 48;
const FADE = "rgba(0,0,0,0.045)";
const MAX_ALPHA = 0.3;
const TURN_CHANCE = 0.25;

interface Tracer {
  x: number;
  y: number;
  dx: number; // unit direction, exactly one of dx/dy is non-zero
  dy: number;
  speed: number;
  color: string;
  steps: number; // grid steps left before respawn
  age: number; // frames since spawn, drives fade-in
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Ambient circuit traces: tracers run along the 24px graph-paper lines, turning 90 degrees at
 * intersections and leaving a small via. By default it fills its positioned parent; with `fixed`
 * it covers the viewport behind the whole page. Renders nothing under reduced motion.
 */
export function TraceField({ fixed = false, className = "" }: { fixed?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduced?.matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let raf = 0;
    const tracers: Tracer[] = [];

    function spawn(t: Tracer) {
      const cols = Math.max(1, Math.floor(W / GRID));
      const rows = Math.max(1, Math.floor(H / GRID));
      const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
      t.x = Math.floor(Math.random() * (cols + 1)) * GRID;
      t.y = Math.floor(Math.random() * (rows + 1)) * GRID;
      t.dx = dx;
      t.dy = dy;
      t.speed = 0.6 + Math.random() * 0.6;
      t.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      t.steps = 200 + Math.floor(Math.random() * 400);
      t.age = 0;
    }

    function resize() {
      if (!canvas || !ctx || !host) return;
      W = fixed ? window.innerWidth : host.clientWidth;
      H = fixed ? window.innerHeight : host.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (tracers.length === 0) {
        for (let i = 0; i < TRACERS; i++) {
          const t = { age: 0 } as Tracer;
          spawn(t);
          t.age = Math.floor(Math.random() * 60);
          tracers.push(t);
        }
      }
    }

    function draw() {
      raf = requestAnimationFrame(draw);
      if (!ctx || document.hidden) return;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = FADE;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";

      for (const t of tracers) {
        const px = t.x;
        const py = t.y;
        const pos = t.dx !== 0 ? px : py;
        const dir = t.dx !== 0 ? t.dx : t.dy;
        const mod = ((pos % GRID) + GRID) % GRID;
        // Distance to the next grid intersection along the current direction.
        const remaining = dir > 0 ? GRID - mod : mod === 0 ? GRID : mod;
        const arrives = t.speed >= remaining;
        const step = arrives ? remaining : t.speed;
        let nx = px + t.dx * step;
        let ny = py + t.dy * step;
        let turned = false;

        if (arrives) {
          // Snap exactly onto the intersection, then maybe turn 90 degrees.
          nx = Math.round(nx / GRID) * GRID;
          ny = Math.round(ny / GRID) * GRID;
          t.steps--;
          if (Math.random() < TURN_CHANCE) {
            const sign = Math.random() < 0.5 ? 1 : -1;
            const horizontal = t.dx !== 0;
            t.dx = horizontal ? 0 : sign;
            t.dy = horizontal ? sign : 0;
            turned = true;
          }
        }

        t.age++;
        const fade = Math.min(1, t.age / 40);
        const alpha = MAX_ALPHA * fade;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        if (turned) {
          ctx.fillStyle = t.color;
          ctx.globalAlpha = Math.min(0.5, alpha * 1.6);
          ctx.fillRect(nx - 1.5, ny - 1.5, 3, 3);
        }

        t.x = nx;
        t.y = ny;
        if (t.steps <= 0 || nx < 0 || nx > W || ny < 0 || ny > H) spawn(t);
      }
      ctx.globalAlpha = 1;
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [fixed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-0 h-full w-full motion-reduce:hidden ${className}`}
    />
  );
}
