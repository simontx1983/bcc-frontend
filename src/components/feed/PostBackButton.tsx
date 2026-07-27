"use client";

/**
 * PostBackButton — the "Back to Floor" affordance on the `/post/[id]`
 * permalink. When the viewer arrived by clicking a feed card (in-app
 * soft-nav), this calls `router.back()` so the browser restores the
 * feed's scroll position from React Query's cache — the Reddit/Twitter
 * feel. When the page was landed cold (shared link, refresh, external
 * referrer), there's no in-app entry to pop, so it pushes `/` instead of
 * stranding the user on a back stack that leaves the site.
 *
 * Desktop: floats as a sticky glass pill so the way back is always
 * reachable without scrolling up — full icon+label pill at rest, collapses
 * to a circular icon button on scroll. Mobile ((detail)'s bare shell has no
 * SiteHeader above it): widens to a full-width glass bar standing in for
 * the header, using the SAME `isMobile` signal `(detail)/layout.tsx` uses
 * to pick its chrome branch — they have to agree on the same breakpoint or
 * this ends up offset under a header that isn't there. Still collapses to
 * the same small circle either way once scrolled.
 *
 * The feed scrolls inside the center column on desktop but the window on
 * mobile (`(detail)`'s bare shell isn't inside AppShell's per-column
 * scroll lock — see globals.css `.bcc-detail-shell`), so scroll position
 * is read from the nearest scrollable ancestor, falling back to `window`.
 * Collapse transitions are `motion-safe:` so reduced-motion users get an
 * instant, non-animated swap.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { useIsMobile } from "@/hooks/useIsMobile";

// Past this many px of scroll the pill collapses to its icon-only circle.
const COLLAPSE_AT = 72;

export function PostBackButton() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Captured once on mount: did we get here via an in-app navigation we
  // can safely pop back into? `history.length > 1` alone is unreliable
  // (a fresh tab can still report 2), so we also require a same-origin
  // referrer — cold landings and external links have neither.
  const canGoBack = useRef(false);

  useEffect(() => {
    const sameOriginReferrer =
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
    canGoBack.current = sameOriginReferrer && window.history.length > 1;
  }, []);

  // Watch the real scroll container (the center column scrolls, not the
  // window) so the pill knows when to collapse.
  useEffect(() => {
    const el = rootRef.current;
    if (el === null) return undefined;

    // Stop before document.body/documentElement — the mobile bare shell
    // sets `overflow: auto` on body for CSS propagation purposes (see
    // .bcc-detail-shell in globals.css), so the walk would otherwise
    // "find" body as a scroll container, but body.scrollTop never
    // actually moves for viewport-level scrolling (the browser scrolls
    // the viewport itself, not body's own box) — collapse never fired
    // on mobile as a result. Only a genuine inner scroll region (like
    // desktop's .bcc-col-center) should be picked up here; anything
    // that bottoms out at body correctly falls back to window instead.
    let scroller: HTMLElement | Window = window;
    let parent = el.parentElement;
    while (parent !== null && parent !== document.body) {
      const overflowY = getComputedStyle(parent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        scroller = parent;
        break;
      }
      parent = parent.parentElement;
    }

    const readTop = () =>
      scroller === window
        ? window.scrollY
        : (scroller as HTMLElement).scrollTop;
    const onScroll = () => setCollapsed(readTop() > COLLAPSE_AT);

    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const onBack = useCallback(() => {
    if (canGoBack.current) {
      router.back();
    } else {
      router.push("/");
    }
  }, [router]);

  // Mobile at rest: full-width bar standing in for the (detail) bare
  // shell's missing header. Collapsed always reads as the same small
  // circle, mobile or desktop. Desktop is unchanged from before the split.
  const mobileBar = isMobile && !collapsed;

  // -mt-4 cancels the page wrapper's own py-4 top padding (post/[id]/
  // page.tsx) — this bar stands in for the page's header, so it needs to
  // sit flush against the true viewport top with no gap above it.
  const wrapperClass = mobileBar
    ? "sticky top-0 z-30 -mx-2 -mt-4 mb-3 w-[calc(100%+16px)]"
    : isMobile
      ? "sticky top-3 z-30 mb-3 w-fit"
      : "sticky top-[72px] z-30 mb-3 w-fit";

  const buttonClass =
    "group flex items-center shadow-sm motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out hover:text-[var(--bcc-accent)] " +
    (mobileBar
      ? "h-[var(--bcc-header-h)] w-full justify-start rounded-none border-x-0 border-b border-t-0 pl-4"
      : collapsed
        ? "h-9 w-9 justify-center rounded-full border"
        : "h-9 w-auto justify-start rounded-full border pl-2.5 pr-4");

  return (
    <div ref={rootRef} className={wrapperClass}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Floor"
        title="Back to Floor"
        className={buttonClass}
        style={{
          background: "var(--bcc-glass-bg)",
          backdropFilter: "blur(var(--bcc-glass-blur))",
          WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
          borderColor: "var(--bcc-glass-border)",
          color: "var(--bcc-text)",
        }}
      >
        <ChevronLeft size={18} strokeWidth={2.2} className="shrink-0" aria-hidden />
        <span
          className={
            "bcc-mono overflow-hidden whitespace-nowrap text-[12px] tracking-[0.08em] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out " +
            (collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[140px] opacity-100")
          }
        >
          Back to Floor
        </span>
      </button>
    </div>
  );
}
