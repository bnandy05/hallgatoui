"use client";

import { useEffect, useRef } from "react";

// Brand colours (cyan, coral, teal). Trails fade out by erasing alpha, so the canvas stays
// transparent over the page background instead of painting a flat rectangle.
const COLORS = ["#9cdef2", "#e06c75", "#5fb6cc"];
const FADE = "rgba(0,0,0,0.06)";
const PARTICLES = 140;

function n2(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = n2(ix, iy);
  const b = n2(ix + 1, iy);
  const c = n2(ix, iy + 1);
  const d = n2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

interface Particle {
  x: number;
  y: number;
  life: number;
  c: string;
}

/** Ambient Perlin flow-field behind a heading block. Renders nothing under reduced motion. */
export function FlowField({ className = "" }: { className?: string }) {
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
    let t = 0;
    let raf = 0;
    const particles: Particle[] = [];

    function resize() {
      if (!canvas || !ctx || !host) return;
      W = host.clientWidth;
      H = host.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length === 0) {
        for (let i = 0; i < PARTICLES; i++) {
          particles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            life: Math.random(),
            c: COLORS[i % COLORS.length],
          });
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
      for (const p of particles) {
        const ang = noise(p.x * 0.004 + t * 0.0008, p.y * 0.004 + 100) * Math.PI * 6;
        const sp = 1 + noise(p.x * 0.003, p.y * 0.003 + 50) * 1.5;
        p.x += Math.cos(ang) * sp;
        p.y += Math.sin(ang) * sp;
        p.life -= 0.001;
        if (p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.life = 1;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = p.life * 0.18;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      t++;
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full opacity-90 motion-reduce:hidden ${className}`}
    />
  );
}
