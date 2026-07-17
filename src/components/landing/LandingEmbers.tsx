"use client";

/**
 * LandingEmbers — ambient forge-ember canvas behind the hero, plus
 * cursor-triggered sparks. Ported from the approved mockup 1:1: hard-cap
 * 44 particles, ambient floor refills to 22, cursor emitter throttled to
 * ~45ms, one shared rAF loop. Reads `--bcc-secondary` at paint time so it
 * tracks theme/accent changes without a re-render. Fully inert under
 * `prefers-reduced-motion` — no canvas draw loop, no listeners.
 *
 * Renders as an absolutely-positioned canvas (`inset-0`) — the parent
 * hero section must be `position: relative`. Cursor sparks listen on the
 * canvas's own parent element (matches the mockup's `.heroA` listener),
 * not the canvas itself, since the canvas is `pointer-events: none` so
 * it never blocks clicks on the CTAs layered above it.
 */

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const CAP = 44;
const AMBIENT_FLOOR = 22;
const SPARK_THROTTLE_MS = 45;

interface Particle {
  x: number;
  y: number;
  r: number;
  s: number;
  a: number;
  dx: number;
}

export function LandingEmbers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (canvas === null || canvas === undefined || parent === null || parent === undefined) {
      return undefined;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return undefined;

    let particles: Particle[] = [];
    let raf = 0;
    let lastSpark = 0;

    const newParticle = (init: boolean): Particle => ({
      x: Math.random() * canvas.width,
      y: init ? Math.random() * canvas.height : canvas.height + 10,
      r: Math.random() * 2 + 1,
      s: Math.random() * 0.5 + 0.2,
      a: Math.random() * 0.5 + 0.25,
      dx: (Math.random() - 0.5) * 0.3,
    });

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    particles = Array.from({ length: 24 }, () => newParticle(true));

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const onPointerMove = (e: PointerEvent) => {
      if (particles.length >= CAP) return;
      const now = performance.now();
      if (now - lastSpark < SPARK_THROTTLE_MS) return;
      lastSpark = now;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (let i = 0; i < 2 && particles.length < CAP; i++) {
        particles.push({
          x,
          y,
          r: Math.random() * 2 + 1.2,
          s: Math.random() * 0.8 + 0.5,
          a: Math.random() * 0.5 + 0.45,
          dx: (Math.random() - 0.5) * 0.9,
        });
      }
    };
    parent.addEventListener("pointermove", onPointerMove, { passive: true });

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // color-token-guard:allow — canvas 2D fillStyle needs a resolved
      // string; this is a defensive fallback for the rare case the
      // --bcc-secondary custom-property read comes back empty (e.g. a
      // paint before styles are attached), not a chosen color.
      const color = getComputedStyle(document.documentElement).getPropertyValue("--bcc-secondary").trim() || "#f98a1c";
      ctx.fillStyle = color;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p === undefined) continue;
        p.y -= p.s;
        p.x += p.dx;
        p.a -= 0.002;
        if (p.y < -10 || p.a <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      while (particles.length < AMBIENT_FLOOR) particles.push(newParticle(false));
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      parent.removeEventListener("pointermove", onPointerMove);
    };
  }, [reduced]);

  if (reduced) return null;

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 z-0 pointer-events-none" />;
}
