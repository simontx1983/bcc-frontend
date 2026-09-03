"use client";

/**
 * TabRail — the swipe affordances for a horizontally scrollable tab strip.
 *
 * Below `sm` the tab strips scroll rather than wrap, because eight labels
 * cannot wrap at 360px without eating four rows before any content. Scrolling
 * is the right call there, but it shipped with neither of the two things that
 * make a scrollable rail usable:
 *
 *   1. NOTHING INDICATED MORE TABS EXISTED. `overflow-x-auto` renders no
 *      scrollbar until you scroll, so a rail that continues past the right
 *      edge looks exactly like a rail that ends there. This is the same class
 *      of failure that hid the Account settings tab on desktop — there the
 *      cause was a missing wrap, here it is a missing hint.
 *
 *   2. THE SELECTED TAB COULD BE OFF-SCREEN ON ARRIVAL. `useRovingTabs`
 *      scrolls the FOCUSED tab into view, which is correct for keyboard
 *      arrowing, but a deep link like `?tab=account` selects without
 *      focusing. The operator landed on the right panel with the active tab
 *      out of sight, and no way to tell which one it was.
 *
 * This wraps a strip and fixes both, without touching the strip's markup,
 * keys, labels or panel mapping.
 *
 * ## The fade is decoration only
 *
 * `aria-hidden`, not focusable, `pointer-events: none` so it never eats a
 * swipe or a tap on the tab underneath. It cannot be the accessibility
 * signal — the roving tabIndex and the scroll-into-view below are. It exists
 * so a sighted operator can see that the rail continues.
 *
 * ## Two surface families — which one to pass
 *
 * A gradient must fade to whatever is actually behind the rail, and this app
 * has two palettes that must not cross: theme-aware app surfaces, and the
 * fixed cream/ink paper family.
 *
 *   - DEFAULT (`surface="theme"`) — use for any rail on a theme-aware
 *     application background. Every wired rail today is one of these.
 *   - `surface="paper"` — use ONLY when a genuinely scrolling rail sits on the
 *     fixed cream/ink paper surface (`bcc-paper`, `border-ink/15`, `text-ink`).
 *     A theme gradient there fades to #0d1117 over cream and reads as a grey
 *     smear.
 *
 * No production rail passes `paper` today: the paper-family tablists
 * (WatchingPanel, PhotosPanel) WRAP at every width and therefore never
 * overflow, so they need no rail at all. That is deliberate — a rail must not
 * be wired into a non-overflowing strip merely to give this branch a consumer.
 *
 * The branch is kept because the failure it prevents is silent and this
 * codebase has 23 paper-family `LoadFailure` call sites, so a paper rail is a
 * question of when. It costs one union member and one entry in the token table
 * below — no duplicated component, no separate code path beyond the lookup —
 * and it is covered by unit tests plus a browser measurement proving the
 * gradient resolves to #f7efd9, the real paper tone.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Read the preference AT THE MOMENT OF SCROLLING.
 *
 * `usePrefersReducedMotion` is SSR-safe by design: it starts `false` and only
 * resolves to the real value after its own effect. TabRail's mount reveal
 * fires in that same commit, so a component reading the hook animated the
 * FIRST reveal — the deep-link arrival, the one that matters most — for
 * exactly the user who asked for no motion. A mutation control caught it:
 * inverting the branch changed nothing, because the branch never saw `true`.
 *
 * Every call here happens inside an effect or a handler, never during render,
 * so querying directly is safe and always current.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type TabRailSurface = "theme" | "paper";

/**
 * Kept as data rather than inline conditionals so the contract test can
 * import and assert against it directly — the LOAD_FAILURE_TOKENS pattern.
 */
export const TAB_RAIL_FADE: Record<TabRailSurface, { left: string; right: string }> = {
  // The app strips sit directly on the page background, not inside a panel.
  theme: {
    left: "bg-gradient-to-r from-bcc-bg to-transparent",
    right: "bg-gradient-to-l from-bcc-bg to-transparent",
  },
  // Fixed cream. `paper` is the brighter of the two paper tones and is what
  // WatchingPanel's <article className="bcc-paper"> paints behind the rail.
  paper: {
    left: "bg-gradient-to-r from-paper to-transparent",
    right: "bg-gradient-to-l from-paper to-transparent",
  },
};

/** How close to an edge still counts as "at" it — sub-pixel scroll offsets. */
const EDGE_EPSILON = 2;

export interface TabRailProps {
  /** Palette family of the surface behind the rail. */
  surface?: TabRailSurface;
  /**
   * The currently selected tab's key. A change scrolls that tab into view
   * even when focus did not move — deep links, Back/Forward, and programmatic
   * selection all land here.
   */
  activeKey: string;
  children: React.ReactNode;
}

export function TabRail({ surface = "theme", activeKey, children }: TabRailProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  /** The scrollable element is the strip itself, not this wrapper. */
  const railOf = useCallback((): HTMLElement | null => {
    const wrap = wrapRef.current;
    if (wrap === null) return null;
    return wrap.querySelector<HTMLElement>('[role="tablist"]');
  }, []);

  /**
   * Recompute which edges have content beyond them. Both false when the rail
   * does not overflow at all, which is also the wrapped state above `sm` —
   * so the fades disappear there without needing to know the breakpoint.
   */
  const measure = useCallback(() => {
    const rail = railOf();
    if (rail === null) return;
    const overflow = rail.scrollWidth - rail.clientWidth;
    if (overflow <= EDGE_EPSILON) {
      setEdges((prev) => (prev.start || prev.end ? { start: false, end: false } : prev));
      return;
    }
    const next = {
      start: rail.scrollLeft > EDGE_EPSILON,
      end: rail.scrollLeft < overflow - EDGE_EPSILON,
    };
    // Bail when nothing changed; scroll fires continuously and a setState per
    // frame would re-render the whole strip.
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [railOf]);

  /**
   * Bring the selected tab into view. Scoped to the rail by scrolling the
   * rail's own scrollLeft rather than calling scrollIntoView, which walks
   * every scrollable ancestor and would move the page vertically.
   */
  const revealActive = useCallback(() => {
    const rail = railOf();
    if (rail === null) return;
    if (rail.scrollWidth - rail.clientWidth <= EDGE_EPSILON) return; // wrapped or fits

    // Located by ARIA state, never by the key: a key containing a CSS
    // metacharacter would otherwise break the selector, and text can change.
    const active = rail.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active === null) return;

    const railBox = rail.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    const overshootRight = tabBox.right - railBox.right;
    const overshootLeft = railBox.left - tabBox.left;
    if (overshootRight <= 0 && overshootLeft <= 0) return; // already visible

    // Centre it when possible so neighbours stay in view as context.
    const target =
      rail.scrollLeft + (tabBox.left - railBox.left) - (railBox.width - tabBox.width) / 2;
    rail.scrollTo({
      left: Math.max(0, target),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [railOf]);

  // Mount + every selection change. `activeKey` in the deps is what makes a
  // deep link, a Back/Forward navigation and a plain click all behave the
  // same: selection moved, so the selected tab is shown.
  useEffect(() => {
    revealActive();
    // Re-measure after the scroll settles so the fades match where we landed.
    const t = window.setTimeout(measure, prefersReducedMotion() ? 0 : 320);
    return () => window.clearTimeout(t);
  }, [activeKey, revealActive, measure]);

  // Scroll, resize, and anything that changes the rail's contents or metrics.
  useEffect(() => {
    const rail = railOf();
    if (rail === null) return;

    measure();
    rail.addEventListener("scroll", measure, { passive: true });

    // Catches viewport resize, the sm↔below-sm wrap flip, tab-list content
    // changes, and late label reflow. Feature-detected rather than assumed:
    // both observers are absent in some runtimes, and a missing one must
    // degrade to "fades update on scroll" rather than throw on mount.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(rail);
      for (const child of Array.from(rail.children)) ro.observe(child);
    } else {
      // No ResizeObserver: fall back to the viewport-level signal so a
      // rotation or window resize still recomputes.
      window.addEventListener("resize", measure);
    }

    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        measure();
      });
      mo.observe(rail, { childList: true, subtree: true, characterData: true });
    }

    // Web-font swap changes label widths after first paint.
    let cancelled = false;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts !== undefined) {
      void fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      rail.removeEventListener("scroll", measure);
      if (ro === null) window.removeEventListener("resize", measure);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [railOf, measure]);

  const fade = TAB_RAIL_FADE[surface];

  return (
    <div ref={wrapRef} className="relative">
      {children}
      {/* Decoration. Hidden from assistive tech, unfocusable, and transparent
          to pointer and touch so a swipe passes through to the rail. `sm:hidden`
          because the rail wraps above the breakpoint and there is nothing left
          to scroll — a gradient there would read as a rendering fault.

          `forced-colors:hidden` because a high-contrast user has replaced the
          palette on purpose. A gradient is a hint, not information: the tabs,
          their active underline and the focus ring all survive without it, so
          the honest thing is to remove it rather than fight the user's palette.
          Browsers do drop most background images in forced-colors mode, but
          that behaviour is not uniform enough to rely on, and the alternative —
          `forced-color-adjust: none` — would force a decorative gradient back
          into a mode the user chose to escape. */}
      <span
        aria-hidden="true"
        data-tab-fade="start"
        className={
          "pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-150 motion-reduce:transition-none forced-colors:hidden sm:hidden " +
          fade.left +
          (edges.start ? " opacity-100" : " opacity-0")
        }
      />
      <span
        aria-hidden="true"
        data-tab-fade="end"
        className={
          "pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-150 motion-reduce:transition-none forced-colors:hidden sm:hidden " +
          fade.right +
          (edges.end ? " opacity-100" : " opacity-0")
        }
      />
    </div>
  );
}
