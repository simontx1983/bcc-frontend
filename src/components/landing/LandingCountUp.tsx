"use client";

/**
 * LandingCountUp — counts from 0 to `target` once the stat scrolls into
 * view (cubic ease-out, ~1.1s, matches the mockup). Reduced-motion skips
 * straight to the final value.
 */

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const DURATION_MS = 1100;

export function LandingCountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return undefined;
    }
    const el = ref.current;
    if (el === null) return undefined;
    let raf = 0;
    let seen = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined || !entry.isIntersecting || seen) return;
        seen = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / DURATION_MS);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(eased * target));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [reduced, target]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}
