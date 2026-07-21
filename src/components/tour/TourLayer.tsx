"use client";

/**
 * TourLayer — the overlay the tour engine draws: a dimmed backdrop with a
 * rounded spotlight cut around the active step's target, plus an adaptive
 * popover (title / body / progress / nav). Portalled to <body>.
 *
 * Behaviour:
 *   - Measures the target via getBoundingClientRect; re-measures on scroll,
 *     resize, and target resize (ResizeObserver). Scrolls the target into
 *     view on step entry.
 *   - If the target isn't in the DOM yet (e.g. right after a cross-page
 *     nav), it retries briefly; if it never appears it auto-advances rather
 *     than trapping the user.
 *   - `center: true` steps (or a missing target) render a centered card
 *     with no spotlight.
 *   - Keyboard: Esc = skip, →/Enter = next, ← = back. Reduced-motion drops
 *     all transitions. On narrow screens the popover docks to the bottom
 *     (CSS), so off-screen math never strands it.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTour } from "@/components/tour/useTour";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { firstVisibleMatch } from "@/lib/tour/dom";

const TARGET_RETRY_MS = 120;
const TARGET_GIVE_UP_MS = 1600;
const POPOVER_GAP = 14;
const VIEWPORT_MARGIN = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourLayer() {
  const tour = useTour();
  const reduced = usePrefersReducedMotion();
  const { stepDef, definition } = tour;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = definition !== null && stepDef !== null;

  if (!mounted || !active) return null;

  return createPortal(
    <TourLayerInner key={`${definition.id}-${tour.stepIndex}`} reduced={reduced} />,
    document.body,
  );
}

function TourLayerInner({ reduced }: { reduced: boolean }) {
  const tour = useTour();
  const { stepDef, stepIndex, totalSteps, isFirst, isLast, next, back, skip, dismissForSession } = tour;

  // "Don't show again" — default ON (permanent), matching the preference
  // that a dismissed tour stays dismissed. Unchecking downgrades a Skip to
  // a session-only dismissal, so it can resurface next session.
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const handleSkip = useCallback(() => {
    if (dontShowAgain) skip();
    else dismissForSession();
  }, [dontShowAgain, skip, dismissForSession]);

  const [rect, setRect] = useState<Rect | null>(null);
  // Target isn't present on THIS viewport (e.g. a sidebar-only element on
  // mobile) — fall back to a centered card so the step's content still
  // lands instead of hanging or auto-skipping.
  const [targetMissing, setTargetMissing] = useState(false);
  const [popSize, setPopSize] = useState<{ w: number; h: number }>({ w: 320, h: 180 });
  const popRef = useRef<HTMLDivElement>(null);

  const isCenter = stepDef?.center === true || stepDef?.target === undefined || targetMissing;
  const padding = stepDef?.padding ?? 8;

  const measure = useCallback((el: Element) => {
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Locate + track the target. Retries briefly for a late-mounting target;
  // auto-advances if it never appears.
  useEffect(() => {
    if (stepDef?.center === true || stepDef?.target === undefined) {
      setRect(null);
      return undefined;
    }
    const selector = stepDef.target;
    let observer: ResizeObserver | null = null;
    let retry: number | undefined;
    let el: Element | null = null;
    const start = Date.now();

    const attach = (found: Element) => {
      el = found;
      found.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
      measure(found);
      observer = new ResizeObserver(() => measure(found));
      observer.observe(found);
    };

    const tryFind = () => {
      const found = firstVisibleMatch(selector);
      if (found !== null) {
        attach(found);
        return;
      }
      if (Date.now() - start > TARGET_GIVE_UP_MS) {
        // Not present/visible on this viewport — show the step centered so
        // its content still delivers (user controls Next/Done).
        setTargetMissing(true);
        return;
      }
      retry = window.setTimeout(tryFind, TARGET_RETRY_MS);
    };
    tryFind();

    const onReflow = () => {
      if (el !== null) measure(el);
    };
    window.addEventListener("scroll", onReflow, { passive: true, capture: true });
    window.addEventListener("resize", onReflow, { passive: true });

    return () => {
      if (retry !== undefined) window.clearTimeout(retry);
      if (observer !== null) observer.disconnect();
      window.removeEventListener("scroll", onReflow, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onReflow);
    };
    // Re-runs only when the step's target changes (per-step remount via key
    // resets targetMissing). isCenter/next intentionally excluded to avoid
    // a re-find loop when targetMissing flips.
  }, [stepDef, measure, reduced]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handleSkip(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (!isFirst) back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, handleSkip, isFirst]);

  // Focus the popover on entry so the keyboard controls + screen readers
  // land here.
  useEffect(() => {
    popRef.current?.focus();
  }, []);

  // Measure the popover so placement math uses its real size.
  useLayoutEffect(() => {
    const el = popRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    setPopSize({ w: r.width, h: r.height });
  }, [rect, stepIndex]);

  const pos = computePopoverPosition(rect, isCenter, popSize, stepDef?.placement ?? "auto");

  const spotlightPad = padding;
  const holeRadius = 10;

  return (
    <div
      className="bcc-tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={stepDef?.title ?? "Guided tour"}
      style={reduced ? { transition: "none" } : undefined}
    >
      {/* Backdrop + spotlight. Center steps get a plain dim. */}
      {isCenter || rect === null ? (
        <div className="bcc-tour-scrim" onClick={handleSkip} />
      ) : (
        <>
          <svg className="bcc-tour-scrim-svg" width="100%" height="100%" onClick={handleSkip} aria-hidden>
            <defs>
              <mask id="bcc-tour-hole">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x={rect.left - spotlightPad}
                  y={rect.top - spotlightPad}
                  width={rect.width + spotlightPad * 2}
                  height={rect.height + spotlightPad * 2}
                  rx={holeRadius}
                  fill="black"
                />
              </mask>
            </defs>
            <rect x="0" y="0" width="100%" height="100%" mask="url(#bcc-tour-hole)" className="bcc-tour-scrim-fill" />
          </svg>
          <div
            aria-hidden
            className="bcc-tour-ring"
            style={{
              top: rect.top - spotlightPad,
              left: rect.left - spotlightPad,
              width: rect.width + spotlightPad * 2,
              height: rect.height + spotlightPad * 2,
              borderRadius: holeRadius,
            }}
          />
        </>
      )}

      {/* Popover */}
      <div
        ref={popRef}
        tabIndex={-1}
        className={"bcc-tour-pop" + (isCenter ? " is-center" : "")}
        style={isCenter ? undefined : { top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bcc-tour-pop-progress">
          {tour.definition?.label} · {stepIndex + 1} / {totalSteps}
        </div>
        <h3 className="bcc-tour-pop-title">{stepDef?.title}</h3>
        <p className="bcc-tour-pop-body">{stepDef?.body}</p>
        <div className="bcc-tour-pop-foot">
          <button type="button" className="bcc-tour-pop-skip" onClick={handleSkip}>
            {dontShowAgain ? "Dismiss" : "Skip"}
          </button>
          <div className="bcc-tour-pop-nav">
            {!isFirst && (
              <button type="button" className="bcc-tour-btn bcc-tour-btn-ghost" onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="bcc-tour-btn bcc-tour-btn-primary" onClick={next}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
        <label className="bcc-tour-pop-dsa">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          Don&rsquo;t show again
        </label>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Placement — pick a side with room, then clamp into the viewport.
// ─────────────────────────────────────────────────────────────────────

function computePopoverPosition(
  rect: Rect | null,
  isCenter: boolean,
  pop: { w: number; h: number },
  placement: string,
): { top: number; left: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  if (rect === null || isCenter) {
    return { top: (vh - pop.h) / 2, left: (vw - pop.w) / 2 };
  }

  const sides = placement === "auto" ? ["bottom", "top", "right", "left"] : [placement];

  const room: Record<string, number> = {
    bottom: vh - (rect.top + rect.height),
    top: rect.top,
    right: vw - (rect.left + rect.width),
    left: rect.left,
  };

  let side = sides[0] ?? "bottom";
  for (const candidate of sides) {
    const need = candidate === "top" || candidate === "bottom" ? pop.h + POPOVER_GAP : pop.w + POPOVER_GAP;
    if ((room[candidate] ?? 0) >= need) {
      side = candidate;
      break;
    }
  }

  let top: number;
  let left: number;
  switch (side) {
    case "top":
      top = rect.top - pop.h - POPOVER_GAP;
      left = rect.left + rect.width / 2 - pop.w / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - pop.h / 2;
      left = rect.left - pop.w - POPOVER_GAP;
      break;
    case "right":
      top = rect.top + rect.height / 2 - pop.h / 2;
      left = rect.left + rect.width + POPOVER_GAP;
      break;
    case "bottom":
    default:
      top = rect.top + rect.height + POPOVER_GAP;
      left = rect.left + rect.width / 2 - pop.w / 2;
      break;
  }

  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - pop.h - VIEWPORT_MARGIN));
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - pop.w - VIEWPORT_MARGIN));
  return { top, left };
}
