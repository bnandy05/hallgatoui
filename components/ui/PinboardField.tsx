"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";
import { useDedupedDeadlines } from "@/lib/useDedupedDeadlines";

const NEUTRAL_PIN = "#9aa2a7";
const PAPER = "rgba(253, 253, 250, 0.55)";
const PAPER_EDGE = "rgba(30, 40, 48, 0.07)";
const RULE = "rgba(30, 40, 48, 0.07)";
const HOLE = "rgba(30, 40, 48, 0.16)";
const CONTENT_MAX = 1240; // the page column; slips behind it are drawn much fainter
const IN_COLUMN_ALPHA = 0.3;
const PIN_MS = 1000; // held up, laid on the felt, pinned
const GLOW_MS = 2600; // a fresh slip behind the column stays a little clearer for a moment
const FALL_MS = 1150;
const STAGGER_MS = 140; // several done at once go up one after another
const MAX_ANIMATED = 12; // a bulk change (a feed sync) pins the rest up instantly
const MAX_SLOTS = 600;
// First open in a session: the felt fills up behind the page, after the notices have gone up.
const INTRO_KEY = "hallgatoireteg-felt-intro";
const INTRO_DELAY_MS = 520;
const INTRO_SPAN_MS = 1500; // the whole cascade, however many slips
const INTRO_MAX = 36; // older slips beyond this are simply there

/** One finished task on the felt. Its slot index alone decides where it hangs. */
interface Slip {
  slot: number;
  pin: string;
  /** Pinning start (may be in the future while queued); 0 once settled. */
  pinAt: number;
  /** Part of the load-in cascade: no lingering highlight behind the column. */
  quiet?: boolean;
}

interface Falling {
  slot: number;
  pin: string;
  at: number;
}

interface Place {
  x: number; // pin position, px
  y: number;
  w: number;
  h: number;
  angle: number;
  inColumn: boolean;
}

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

/** Van der Corput / Halton: slots spread evenly over the board however many there are. */
function halton(i: number, base: number) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where slot i hangs on a W×H felt. Wide screens fill the gutters first, the column every fifth slip. */
function placeOf(i: number, W: number, H: number): Place {
  const rand = mulberry32(0x5eed + i * 7919);
  const w = 62 + rand() * 66;
  const h = w * (0.58 + rand() * 0.32);
  const angle = (rand() - 0.5) * 0.16;
  const u = halton(i + 1, 2);
  const v = halton(i + 1, 3);
  const y = 28 + v * Math.max(40, H - 28 - h * 0.7);

  const gutter = (W - CONTENT_MAX) / 2;
  let x: number;
  if (gutter >= 90 && i % 5 !== 4) {
    // Left or right gutter, alternating by the sequence, slips may overlap the column edge a little.
    const side = u < 0.5 ? 0 : 1;
    const t = (u % 0.5) * 2;
    const span = gutter + 24;
    x = side === 0 ? 10 + t * (span - 20) : W - 10 - t * (span - 20);
  } else {
    x = 16 + u * (W - 32);
  }
  const colLeft = Math.max(0, gutter);
  const inColumn = x > colLeft - w / 2 && x < W - colLeft + w / 2;
  return { x, y, w, h, angle, inColumn };
}

/**
 * The felt behind every page, and a record of the work done: one faint slip is pinned up for
 * every finished task. Ticking a task off pins a new slip on; unticking takes the most recent
 * one down, and its pin leaves a hole. Slips keep their places across visits (each slot has a
 * fixed position). Idle frames cost nothing: the settled slips are baked into a bitmap, and only
 * a slip in motion is drawn per frame. Under reduced motion changes appear without movement.
 */
export function PinboardField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hydrated = useHydrated();
  const { visible } = useDedupedDeadlines();
  const courses = useStore((s) => s.courses);
  const engine = useRef<{ sync: (doneIds: string[], colorOf: (id: string) => string) => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const baked = document.createElement("canvas");
    const bctx = baked.getContext("2d")!;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let places: Place[] = [];
    let holes: { x: number; y: number; r: number }[] = [];
    let extraHoles: { slot: number }[] = []; // holes left by slips taken down, kept by slot
    let slips: Slip[] = [];
    let falling: Falling[] = [];
    let known: string[] | null = null; // done ids seen so far, in pinning order
    let introAt = 0; // when the load-in cascade was scheduled

    const place = (slot: number) => (places[slot] ??= placeOf(slot, W, H));

    function layout() {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas!, baked]) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      places = [];
      const rand = mulberry32(0xfe17);
      const area = (W * H) / (1440 * 900);
      holes = Array.from({ length: Math.round(90 * Math.max(0.4, area)) }, () => ({
        x: rand() * W,
        y: rand() * H,
        r: 0.7 + rand() * 0.6,
      }));
    }

    /** One slip on the felt. `lift` 1 = held above the board (bigger, softer shadow), 0 = flat. */
    function drawSlip(
      c: CanvasRenderingContext2D,
      p: Place,
      pin: string,
      o: { alpha?: number; dy?: number; dx?: number; angle?: number; lift?: number; pinScale?: number; pinAlpha?: number; glow?: number } = {}
    ) {
      const { alpha = 1, dy = 0, dx = 0, angle = p.angle, lift = 0, pinScale = 1, pinAlpha = 1, glow = 0 } = o;
      if (alpha <= 0.002) return;
      const colAlpha = p.inColumn ? lerp(IN_COLUMN_ALPHA, 0.75, glow) : 1;
      const scale = 1 + lift * 0.1;
      c.save();
      c.globalAlpha = alpha * colAlpha;
      c.translate(p.x + dx, p.y + dy);
      c.rotate(angle);
      c.scale(scale, scale);
      c.shadowColor = `rgba(30, 40, 48, ${0.1 + lift * 0.1})`;
      c.shadowBlur = 8 + lift * 16;
      c.shadowOffsetY = 3 + lift * 12;
      c.fillStyle = PAPER;
      c.fillRect(-p.w / 2, -6, p.w, p.h);
      c.shadowColor = "transparent";
      c.strokeStyle = PAPER_EDGE;
      c.lineWidth = 1;
      c.strokeRect(-p.w / 2 + 0.5, -5.5, p.w - 1, p.h - 1);
      // Two faint ruled "text" lines.
      c.fillStyle = RULE;
      c.fillRect(-p.w / 2 + 10, 12, p.w * 0.55, 3);
      c.fillRect(-p.w / 2 + 10, 21, p.w * 0.32, 3);
      c.restore();

      // A coloured dot next to a line of text reads as a glitch: no pins behind the page column.
      if (pinScale > 0 && pinAlpha > 0 && !p.inColumn) {
        c.save();
        c.globalAlpha = alpha * pinAlpha * 0.85;
        c.translate(p.x + dx, p.y + dy);
        c.scale(pinScale, pinScale);
        c.shadowColor = "rgba(20, 24, 28, 0.3)";
        c.shadowBlur = 2;
        c.shadowOffsetX = 1;
        c.shadowOffsetY = 1.5;
        c.fillStyle = pin;
        c.beginPath();
        c.arc(0, 0, 4.5, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    /** Felt holes plus every settled slip, drawn once into the cached bitmap. */
    function bake() {
      bctx.clearRect(0, 0, W, H);
      bctx.fillStyle = HOLE;
      for (const h of holes) {
        bctx.beginPath();
        bctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        bctx.fill();
      }
      for (const h of extraHoles) {
        const p = place(h.slot);
        bctx.beginPath();
        bctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        bctx.fill();
      }
      for (const s of slips) if (s.pinAt === 0) drawSlip(bctx, place(s.slot), s.pin);
    }

    function drawPinning(s: Slip, now: number) {
      const t = now - s.pinAt;
      if (t < 0) return;
      const p = place(s.slot);
      const m = clamp01(t / (PIN_MS * 0.62)); // laid down
      const k = clamp01((t - PIN_MS * 0.5) / (PIN_MS * 0.5)); // pin goes in
      const lay = easeOutExpo(m);
      // After the pin lands the slip rocks once around it and settles.
      const rock = k > 0 ? Math.sin(k * Math.PI * 2) * (1 - k) * 0.045 : 0;
      // The pin comes in large (close to the eye), presses slightly past flush, then eases back.
      const pinScale =
        k <= 0 ? 0 : k < 0.55 ? lerp(1.9, 0.9, easeOutCubic(k / 0.55)) : lerp(0.9, 1, easeOutCubic((k - 0.55) / 0.45));
      drawSlip(ctx!, p, s.pin, {
        alpha: easeOutCubic(clamp01(t / 260)),
        dy: (1 - lay) * -30,
        dx: (1 - lay) * 6,
        angle: p.angle + (1 - lay) * (p.angle >= 0 ? 0.2 : -0.2) + rock,
        lift: 1 - lay,
        pinScale,
        pinAlpha: easeOutCubic(clamp01(k / 0.3)),
        glow: s.quiet ? 0 : 1 - easeOutCubic(clamp01((t - PIN_MS) / (GLOW_MS - PIN_MS))),
      });
    }

    function drawFalling(f: Falling, now: number) {
      const p = place(f.slot);
      const t = clamp01((now - f.at) / FALL_MS);
      // The pin pops first; the slip swings free about its far corner, then drops away.
      const pop = clamp01(t / 0.2);
      const drop = easeInCubic(clamp01((t - 0.12) / 0.88));
      const dir = p.angle >= 0 ? 1 : -1;
      drawSlip(ctx!, p, f.pin, {
        alpha: 1 - easeInCubic(clamp01((t - 0.35) / 0.65)),
        dy: drop * 110,
        dx: drop * 14 * dir,
        angle: p.angle + easeOutCubic(clamp01(t / 0.4)) * 0.35 * dir + drop * 0.6 * dir,
        pinScale: pop < 1 ? lerp(1, 1.4, Math.sin(pop * Math.PI)) * (1 - pop) : 0,
        pinAlpha: 1 - pop,
      });
    }

    function frame(now: number) {
      raf = 0;
      let busy = false;
      let settled = false;
      for (const s of slips) {
        if (s.pinAt !== 0 && now - s.pinAt >= (s.quiet ? PIN_MS : GLOW_MS)) {
          s.pinAt = 0;
          settled = true;
        }
      }
      const before = falling.length;
      falling = falling.filter((f) => now - f.at < FALL_MS);
      if (settled || before !== falling.length) bake();

      ctx!.clearRect(0, 0, W, H);
      ctx!.drawImage(baked, 0, 0, W, H);
      for (const s of slips) {
        if (s.pinAt !== 0) {
          drawPinning(s, now);
          busy = true;
        }
      }
      for (const f of falling) {
        drawFalling(f, now);
        busy = true;
      }
      if (busy) raf = requestAnimationFrame(frame);
    }

    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function sync(doneIds: string[], colorOf: (id: string) => string) {
      const now = performance.now();
      const done = new Set(doneIds);
      if (known === null) {
        // First look after hydration. On the session's first open the slips are pinned up one
        // after another (the most recent last); after that they are simply there.
        known = doneIds.slice(0, MAX_SLOTS);
        let intro = !reduced && known.length > 0;
        try {
          if (sessionStorage.getItem(INTRO_KEY)) intro = false;
          sessionStorage.setItem(INTRO_KEY, "1");
          if (intro) introAt = now;
        } catch {
          // Storage blocked: play it, once per mount.
        }
        const firstAnimated = intro ? Math.max(0, known.length - INTRO_MAX) : known.length;
        const animated = known.length - firstAnimated;
        const step = animated > 0 ? Math.min(90, INTRO_SPAN_MS / animated) : 0;
        slips = known.map((id, slot) => ({
          slot,
          pin: colorOf(id),
          pinAt: slot < firstAnimated ? 0 : now + INTRO_DELAY_MS + (slot - firstAnimated) * step,
          quiet: true,
        }));
        bake();
        kick();
        return;
      }

      const removed = known.filter((id) => !done.has(id)).length;
      const kept = known.filter((id) => done.has(id));
      const keptSet = new Set(kept);
      const added = doneIds.filter((id) => !keptSet.has(id));
      known = [...kept, ...added].slice(0, MAX_SLOTS);

      // Unticked: the most recent slips come down, whichever task it was, so the board keeps its shape.
      let rebake = false;
      for (let r = 0; r < removed && slips.length > 0; r++) {
        const s = slips.pop()!;
        if (s.pinAt !== 0 && s.pinAt > now) continue; // still queued, never went up
        if (s.pinAt === 0) rebake = true;
        if (reduced) {
          extraHoles.push({ slot: s.slot });
          rebake = true;
        } else {
          falling.push({ slot: s.slot, pin: s.pin, at: now });
          extraHoles.push({ slot: s.slot });
        }
      }
      if (extraHoles.length > 120) extraHoles = extraHoles.slice(-120);

      // Ticked: new slips go up in the next free slots, one after another.
      const room = MAX_SLOTS - slips.length;
      const toAdd = added.slice(0, Math.max(0, room));
      const instant = reduced ? toAdd.length : Math.max(0, toAdd.length - MAX_ANIMATED);
      let start = Math.max(now, ...slips.map((s) => (s.pinAt > 0 ? s.pinAt + STAGGER_MS : 0)));
      toAdd.forEach((id, i) => {
        const slot = slips.length;
        // A slot reused after a slip came down: its hole is covered again.
        extraHoles = extraHoles.filter((h) => h.slot !== slot);
        if (i < instant) {
          slips.push({ slot, pin: colorOf(id), pinAt: 0 });
          rebake = true;
        } else {
          slips.push({ slot, pin: colorOf(id), pinAt: start });
          start += STAGGER_MS;
        }
      });

      if (rebake || toAdd.length > 0) bake();
      kick();
    }

    let resizeTimer = 0;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        layout();
        bake();
        kick();
      }, 120);
    }

    layout();
    bake();
    kick();
    engine.current = { sync };
    window.addEventListener("resize", onResize);
    return () => {
      engine.current = null;
      // Unmounted before the cascade began (a dev double mount): let the next mount play it.
      if (introAt && performance.now() < introAt + INTRO_DELAY_MS) {
        try {
          sessionStorage.removeItem(INTRO_KEY);
        } catch {}
      }
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !engine.current) return;
    const colorOf = new Map(courses.map((c) => [c.id, c.color]));
    const done = visible
      .filter((d) => d.done)
      .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
    const pinOf = new Map(done.map((d) => [d.id, (d.courseId && colorOf.get(d.courseId)) || NEUTRAL_PIN]));
    engine.current.sync(
      done.map((d) => d.id),
      (id) => pinOf.get(id) ?? NEUTRAL_PIN
    );
  }, [hydrated, visible, courses]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
