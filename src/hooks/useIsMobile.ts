"use client";

import { useEffect, useState } from "react";

/** The app's one mobile breakpoint — SiteHeader's search-bar-vs-icon
 * switch, the (detail) shell's chrome swap. Matches the mobile overlay's
 * own `<= 599px` cutoff (see globals.css `.bcc-search` media query). */
const MOBILE_BREAKPOINT = 599;

/**
 * Client-only viewport check — starts `false` (matches SSR, avoids a
 * hydration mismatch) and corrects on mount. A brief wrong-chrome flash on
 * first paint is possible on very slow connections; acceptable tradeoff
 * for not needing server-side UA sniffing for a CSS-driven design.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}
