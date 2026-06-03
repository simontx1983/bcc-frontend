"use client";

/**
 * NavigationProgress — visual feedback during client-side route changes.
 *
 * Two-part indicator:
 *   1. Thin gradient bar at the top of the page (like YouTube / GitHub)
 *   2. Small Validator Ring spinner fixed bottom-right
 *
 * Both stay visible for the entire duration of the navigation, not just
 * a fixed 800ms. They disappear only when usePathname() changes (i.e.
 * the new route has actually rendered).
 *
 * "loading started" signal: a capture-phase click listener on <a> tags.
 * This fires before React's own handlers so the spinner appears instantly.
 *
 * Safety: hidden after 10s if pathname never changes (guards against
 * cancelled navigations or programmatic links that don't change the URL).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ValidatorRing } from "./ValidatorRing";
import "./preloader.css";

type NavState = "idle" | "loading" | "completing";

export function NavigationProgress() {
  const pathname     = usePathname();
  const [state, setState] = useState<NavState>("idle");
  const prevPath     = useRef(pathname);
  const safetyTimer  = useRef<ReturnType<typeof setTimeout>>(undefined);
  const completeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Detect navigation completion ──────────────────────────────────
  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    if (state === "loading") {
      clearTimeout(safetyTimer.current);
      setState("completing");
      completeTimer.current = setTimeout(() => setState("idle"), 500);
    }
  }, [pathname, state]);

  // ── Detect navigation start (link click) ──────────────────────────
  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";

      // Only trigger for internal path links
      if (!href.startsWith("/") || href.startsWith("//")) return;

      // Strip query/hash for comparison
      const targetPath = (href.split("?")[0] ?? href).split("#")[0] ?? href;
      if (targetPath === pathname) return; // same page, skip

      clearTimeout(safetyTimer.current);
      clearTimeout(completeTimer.current);
      setState("loading");

      // Safety: clear after 10s if navigation stalls or is cancelled
      safetyTimer.current = setTimeout(() => setState("idle"), 10_000);
    }

    document.addEventListener("click", onLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", onLinkClick, { capture: true });
      clearTimeout(safetyTimer.current);
      clearTimeout(completeTimer.current);
    };
  }, [pathname]);

  if (state === "idle") return null;

  return (
    <>
      {/* Top bar — grows while loading, completes on done */}
      <div
        className={[
          "bcc-nav-progress",
          state === "loading"    && "bcc-nav-progress--loading",
          state === "completing" && "bcc-nav-progress--completing",
        ].filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        <div className="bcc-nav-progress__bar" />
      </div>

      {/* Centered Validator Ring */}
      <div className="bcc-nav-ring-wrap" aria-hidden="true">
        <ValidatorRing />
      </div>
    </>
  );
}
