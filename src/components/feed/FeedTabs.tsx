"use client";

/**
 * FeedTabs — §N6 scope selector (For You / Watching / Signals).
 *
 * v2 (HANDOVER-comment-v2-polish.md Item 1, locked design): a sliding
 * segmented control (icon + label per scope, animated thumb) that
 * collapses into a small glass-circle FAB showing the active scope's
 * icon once the feed scrolls past its top. Tapping the circle
 * re-expands the control.
 *
 * V1 keeps the state local (no URL-syncing yet). The plan calls for
 * `?feed=signals` deep-linking; lift to URL state when the home page
 * needs shareable tab routes.
 *
 * Default tab is "for_you" per §N6 — the algorithmic feed that
 * combines watched entities, high-trust entities, and recency. New
 * users with zero watched entities still get a useful feed via §F2
 * fallback inside the server's ranking service.
 *
 * Note: the `following` scope value is part of the API contract
 * (§9 — do not rename). The label is the only thing that changed.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BoltIcon, EyeIcon, SparklesIcon } from "@/components/feed/actionIcons";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { FOLLOW_COPY } from "@/lib/copy";
import type { FeedScope } from "@/lib/api/types";

interface FeedTabsProps {
  active: FeedScope;
  onChange: (scope: FeedScope) => void;
}

const TABS: ReadonlyArray<{ scope: FeedScope; label: string; Icon: typeof SparklesIcon }> = [
  { scope: "for_you",   label: "For You",         Icon: SparklesIcon },
  { scope: "following", label: FOLLOW_COPY.state,  Icon: EyeIcon },
  { scope: "signals",   label: "Signals",          Icon: BoltIcon },
];

/**
 * Fresh scroll delta (px) required to flip state — NOT an absolute
 * scroll-position cutoff. An absolute cutoff (e.g. "collapse whenever
 * scrollTop > 24") means that once the viewer is anywhere past that
 * position, tapping the circle to re-expand gets immediately reversed by
 * the very next scroll tick (even a 1px momentum/rounding tick) since
 * scrollTop is still past the cutoff — the control "splutters" open-then-
 * shut. Measuring from a baseline that resets on every state change (incl.
 * a manual tap) means it only re-collapses once the viewer scrolls a fresh
 * 96px in that direction from wherever they last were.
 */
const COLLAPSE_THRESHOLD = 96;

export function FeedTabs({ active, onChange }: FeedTabsProps) {
  const reducedMotion = usePrefersReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [collapsed, setCollapsedState] = useState(false);
  const [thumbRect, setThumbRect] = useState<{ left: number; width: number } | null>(null);
  // A tap-to-peek override, separate from the scroll-driven `collapsed`
  // state: while scrolled down deep, tapping the circle shows the bar as a
  // dismissible overlay — ANY subsequent scroll (even 1px) or a click
  // outside it closes it back to the circle immediately. This is
  // deliberately more eager than the delta-based auto-collapse above,
  // which exists to stop the control fighting the *same* tap that opened
  // it; once open-by-tap, a fresh scroll is the user moving on, not that.
  const [manualOpen, setManualOpen] = useState(false);
  const expanded = manualOpen || !collapsed;

  // Mirror of `collapsed` for the scroll handler below, which is attached
  // once (empty deps) and would otherwise close over a stale value.
  const collapsedRef = useRef(false);
  const baselineRef = useRef(0);
  const setCollapsed = (next: boolean) => {
    collapsedRef.current = next;
    setCollapsedState(next);
  };

  // Scroll ancestor is `.bcc-col-center` (independent-scrolling center
  // column, see AppShell) — attach a debounced (rAF) listener there so
  // the control collapses once the viewer has scrolled a meaningful
  // amount into the feed (see COLLAPSE_THRESHOLD's doc comment for why
  // this is a delta-from-baseline, not an absolute cutoff).
  useEffect(() => {
    const scroller = wrapperRef.current?.closest<HTMLElement>(".bcc-col-center");
    if (scroller === null || scroller === undefined) return undefined;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const st = scroller.scrollTop;
        if (collapsedRef.current) {
          // Collapsed — only auto-expand once scrolled back near the top.
          if (st <= COLLAPSE_THRESHOLD) {
            baselineRef.current = st;
            setCollapsed(false);
          }
        } else if (st - baselineRef.current > COLLAPSE_THRESHOLD) {
          baselineRef.current = st;
          setCollapsed(true);
        }
        ticking = false;
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const handleExpandTap = () => {
    setManualOpen(true);
  };

  // While tap-opened, close on the next scroll (any amount, either
  // direction) or a click outside the control.
  useEffect(() => {
    if (!manualOpen) return undefined;
    const scroller = wrapperRef.current?.closest<HTMLElement>(".bcc-col-center");
    // Deeper in the feed, images/GIFs finishing their async load elsewhere
    // on the page can shift layout enough that the browser's native scroll
    // anchoring nudges scrollTop by a few px — with zero user intent to
    // scroll. A `scroll` event still fires for that nudge, which closed
    // the panel immediately (the "wants to open but shuts right back"
    // report). Track the scrollTop at the moment we opened and only treat
    // it as a real scroll once it's moved more than a tiny dead zone.
    const openedAt = scroller?.scrollTop ?? 0;
    const SCROLL_DEAD_ZONE = 6;
    const close = () => {
      const st = scroller?.scrollTop ?? 0;
      if (Math.abs(st - openedAt) > SCROLL_DEAD_ZONE) {
        setManualOpen(false);
      }
    };
    scroller?.addEventListener("scroll", close, { passive: true });
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setManualOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => {
      scroller?.removeEventListener("scroll", close);
      document.removeEventListener("click", onDocClick);
    };
  }, [manualOpen]);

  const activeIndex = TABS.findIndex((t) => t.scope === active);
  const activeTab = TABS[activeIndex] ?? TABS[0];

  // Measure the active tab's actual box (offsetLeft/offsetWidth relative to
  // `nav`, its offsetParent) rather than computing thumb geometry from CSS
  // percentages — percentage `width` on an absolutely-positioned child
  // resolves against the containing block's PADDING box, which isn't the
  // same box the flex buttons occupy once the nav itself has padding, so a
  // calc()-based thumb drifts out of alignment past the first tab.
  useLayoutEffect(() => {
    if (!expanded) return;
    const el = tabRefs.current[activeIndex];
    if (el === null || el === undefined) return;
    setThumbRect({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex, expanded]);

  // Re-measure on resize (column width changes at breakpoints).
  useEffect(() => {
    if (!expanded) return undefined;
    const nav = navRef.current;
    if (nav === null || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const el = tabRefs.current[activeIndex];
      if (el !== null && el !== undefined) {
        setThumbRect({ left: el.offsetLeft, width: el.offsetWidth });
      }
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeIndex, expanded]);

  return (
    <div ref={wrapperRef} className="sticky z-30 mt-4 mb-1" style={{ top: "var(--bcc-header-h)" }}>
      {!expanded ? (
        <button
          type="button"
          onClick={handleExpandTap}
          aria-label={`Change feed (${activeTab?.label ?? "For You"}) — tap to open`}
          className={
            "flex h-[42px] w-[42px] items-center justify-center rounded-full text-[var(--bcc-accent)] " +
            (reducedMotion ? "" : "motion-safe:transition-opacity motion-safe:duration-200")
          }
          style={{
            background: "var(--bcc-glass-bg)",
            backdropFilter: "blur(var(--bcc-glass-blur))",
            WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
            border: "1px solid var(--bcc-glass-border)",
            boxShadow: "0 0 0 3px var(--bcc-accent-subtle)",
          }}
        >
          {activeTab && <activeTab.Icon size={17} />}
        </button>
      ) : (
        <nav
          ref={navRef}
          role="tablist"
          aria-label="Feed scope"
          className="relative flex items-stretch gap-0.5 rounded-full p-1"
          style={{ background: "var(--bcc-surface-raised)", border: "1px solid var(--bcc-border)" }}
        >
          {/* Sliding thumb behind the active tab — geometry is measured
              from the active button's actual box (see the layout effect
              above), not guessed via CSS percentages. */}
          {thumbRect !== null && (
            <span
              aria-hidden
              className={
                "absolute inset-y-1 left-0 rounded-full " +
                (reducedMotion ? "" : "motion-safe:transition-[transform,width] motion-safe:duration-[250ms] motion-safe:ease-out")
              }
              style={{
                width: thumbRect.width,
                transform: `translateX(${thumbRect.left}px)`,
                background: "var(--bcc-accent)",
                boxShadow: "0 2px 10px var(--bcc-accent-glow)",
              }}
            />
          )}
          {TABS.map(({ scope, label, Icon }, i) => {
            const isActive = scope === active;
            return (
              <button
                key={scope}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => onChange(scope)}
                className={
                  "bcc-stencil relative z-10 flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-center text-[11px] transition-colors duration-150 sm:text-[12px] " +
                  (isActive ? "text-[var(--bcc-text-inverse)]" : "text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]")
                }
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
