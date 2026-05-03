"use client";

/**
 * usePrefersReducedMotion — listens to OS-level reduced-motion preference.
 *
 * SSR-safe: returns false on the server / before hydration; updates to
 * the live preference once the matchMedia listener attaches. Components
 * can branch their animation paths on the boolean directly.
 */

import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
