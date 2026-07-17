"use client";

/**
 * useHovercard — the shared open/close/position machinery for desktop
 * hover cards (avatar bylines AND @mention links). Encapsulates the hover
 * intent timers, the `(hover: hover)` gate, viewport-aware positioning,
 * and close-on-scroll/Escape, so each hover surface only supplies its
 * trigger element and the card to render.
 *
 * The consumer spreads `triggerHandlers` on a `<span ref={triggerRef}>`
 * around its trigger, and (when `open`) portals its card to document.body
 * at `coords`, spreading `popoverHandlers` so moving onto the card keeps
 * it open. Portaling is why the card can't be clipped by an ancestor's
 * `overflow: hidden` (e.g. the sidebar widget cards).
 */

import { useEffect, useRef, useState, type RefObject } from "react";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 150;
const CARD_WIDTH = 288; // w-72
const CARD_EST_HEIGHT = 320; // used to flip above near the viewport bottom
const GAP = 8;
const MARGIN = 12;

export interface HovercardCoords {
  top: number;
  left: number;
}

export interface Hovercard {
  open: boolean;
  coords: HovercardCoords | null;
  triggerRef: RefObject<HTMLSpanElement | null>;
  triggerHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
  popoverHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
}

function computePosition(rect: DOMRect): HovercardCoords {
  // Horizontal: align to the trigger, clamped into the viewport (sidebar
  // avatars sit near the right edge, so this flips them left).
  let left = rect.left;
  if (left + CARD_WIDTH > window.innerWidth - MARGIN) {
    left = window.innerWidth - CARD_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  // Vertical: below the trigger; flip above if it would overflow the bottom.
  let top = rect.bottom + GAP;
  if (top + CARD_EST_HEIGHT > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, rect.top - GAP - CARD_EST_HEIGHT);
  }
  return { top, left };
}

export function useHovercard(): Hovercard {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<HovercardCoords | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const canHover = () =>
    typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

  const handleEnter = () => {
    if (!canHover()) return;
    clearTimers();
    openTimer.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect !== undefined) setCoords(computePosition(rect));
      setOpen(true);
    }, OPEN_DELAY_MS);
  };

  const handleLeave = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      // A modal opened from inside this card (e.g. RankChip's
      // RankInfoModal) renders at a higher z-index directly over the
      // cursor — the browser re-runs its hit-test at the same coordinates
      // and fires this mouseleave even though the pointer never moved.
      // Closing here would unmount the popover's whole subtree, taking
      // the just-opened modal down with it before anyone can see it.
      // Skip the close while any such nested dialog is open (more than
      // just this popover's own role="dialog"); it closes normally once
      // that dialog does, via the same mouseleave path.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // A fixed popover would detach from a scrolled trigger — close instead.
    // Capture phase so inner scroll containers (the feed column) count.
    // Same nested-dialog guard as handleLeave below: RankInfoModal's own
    // Dialog focuses its panel on mount (focus-trap setup), and focusing
    // an element not fully in view can trigger a genuine browser
    // auto-scroll — which this capture-phase listener saw as "the viewer
    // scrolled the page" and closed the hovercard (and the modal with
    // it) before this guard existed. This was the real culprit; the
    // mouseleave guard alone didn't fix it because this is a separate
    // close path.
    const onScroll = () => {
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => clearTimers, []);

  return {
    open,
    coords,
    triggerRef,
    triggerHandlers: { onMouseEnter: handleEnter, onMouseLeave: handleLeave },
    popoverHandlers: { onMouseEnter: handleEnter, onMouseLeave: handleLeave },
  };
}
