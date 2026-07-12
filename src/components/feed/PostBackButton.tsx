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
 * It floats as a sticky glass pill so the way back is always reachable
 * without scrolling up: at the top of the post it reads as a full
 * icon+label pill; once the reader scrolls down it collapses smoothly to
 * a circular icon button, and expands again when they return to the top.
 * The feed scrolls inside the center column (not the window), so scroll
 * position is read from the nearest scrollable ancestor, and the collapse
 * transitions are `motion-safe:` so reduced-motion users get an instant,
 * non-animated swap.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Past this many px of scroll the pill collapses to its icon-only circle.
const COLLAPSE_AT = 72;

export function PostBackButton() {
  const router = useRouter();
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

    let scroller: HTMLElement | Window = window;
    let parent = el.parentElement;
    while (parent !== null) {
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

  return (
    <div ref={rootRef} className="sticky top-[72px] z-30 mb-3 w-fit">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Floor"
        title="Back to Floor"
        className={
          "group flex h-9 items-center rounded-full border shadow-sm motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out hover:text-[var(--bcc-accent)] " +
          (collapsed ? "w-9 justify-center" : "w-auto pl-2.5 pr-4")
        }
        style={{
          background: "var(--bcc-glass-bg)",
          backdropFilter: "blur(var(--bcc-glass-blur))",
          WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
          borderColor: "var(--bcc-glass-border)",
          color: "var(--bcc-text)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
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
