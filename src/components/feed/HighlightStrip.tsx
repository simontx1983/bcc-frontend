"use client";

/**
 * HighlightStrip — §O2 / §O2.1 implementation.
 *
 * Three slots, strict priority order (slot 1 → slot 3), max one item
 * per slot, empty slots collapse. The server returns 0–3 items
 * already in priority order — we render in array order and never
 * reshuffle (per §O2.1 "stable ordering" invariant).
 *
 * Per-slot accent: a thin colored bar on the left edge. Slot 1
 * (negative) uses safety-orange; slot 2 (positive) uses verified-green;
 * slot 3 (external) uses blueprint-blue. Color carries meaning even
 * before the title is read.
 *
 * Empty/loading/error states:
 *   - loading → silent (no skeleton; the strip is supplementary, not
 *     load-bearing for the page)
 *   - error   → silent and let the rest of the page render. A failed
 *     highlights call should never block the Floor.
 *   - empty   → null (slots collapse, including all three at once)
 *
 * Auth: this component assumes the parent has gated mounting on a
 * logged-in session. The endpoint is auth-required and would 401
 * otherwise — bccFetchAsClient already handles 401-auto-signOut.
 *
 * Dismissal animation: clicking ✕ adds the id to a local
 * `dismissingIds` set and starts a ~220ms fade/slide-out before the
 * mutation fires. The cache update unmounts the <li> after the
 * animation has visibly completed. Reduced-motion users skip the
 * transition (motion-safe: variants) and unmount on the same tick.
 */

import { useEffect, useRef, useState } from "react";

import type { Route } from "next";
import Link from "next/link";

import {
  useDismissHighlightMutation,
  useHighlights,
} from "@/hooks/useHighlights";
import type { HighlightItem, HighlightSlot } from "@/lib/api/types";

const SLOT_ACCENT: Record<HighlightSlot, { bar: string; label: string }> = {
  negative: { bar: "var(--safety)",    label: "WATCH" },
  positive: { bar: "var(--verified)",  label: "FOR YOU" },
  external: { bar: "var(--blueprint)", label: "ON THE FLOOR" },
};

// Match the CSS transition window below; the cache update fires after
// this delay so the exit animation is visibly complete before unmount.
const DISMISS_ANIMATION_MS = 220;

export function HighlightStrip() {
  const query = useHighlights();
  const dismiss = useDismissHighlightMutation();

  // Local set of ids currently animating out. Driven only by the click
  // handler; the cache update purges entries from `items` on its own
  // schedule, so any stale ids in the set become harmless (the matching
  // <li> is gone).
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  // Pending dismissal timers. Cleared on unmount so a sign-out or route
  // change during the animation window doesn't fire a stale mutate()
  // against an already-torn-down auth context.
  const pendingTimers = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  // Silent failure modes — the strip is supplementary chrome.
  if (query.isError || query.isLoading) {
    return null;
  }

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    setDismissingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Delay the mutation so the exit animation has time to render.
    // Reduced-motion users still see the same brief gap, which is
    // acceptable — the global prefers-reduced-motion rule shortens
    // the visual transition to ~0ms anyway.
    const timerId = window.setTimeout(() => {
      pendingTimers.current.delete(timerId);
      dismiss.mutate(id);
    }, DISMISS_ANIMATION_MS);
    pendingTimers.current.add(timerId);
  };

  return (
    <section
      aria-label="Highlights"
      className="mx-auto mt-2 max-w-6xl px-6 sm:px-8"
    >
      <div className="bcc-mono mb-3 flex items-center gap-3 text-cardstock-deep">
        <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
        <span>What to know</span>
        <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <HighlightCard
            key={item.id}
            item={item}
            isDismissing={
              (dismiss.isPending && dismiss.variables === item.id) ||
              dismissingIds.has(item.id)
            }
            isExiting={dismissingIds.has(item.id)}
            onDismiss={() => handleDismiss(item.id)}
          />
        ))}
      </ul>
    </section>
  );
}

interface HighlightCardProps {
  item: HighlightItem;
  /** Disables the dismiss button (mutation in flight or animation queued). */
  isDismissing: boolean;
  /** True once the animation has been triggered locally — applies exit styles. */
  isExiting: boolean;
  onDismiss: () => void;
}

function HighlightCard({
  item,
  isDismissing,
  isExiting,
  onDismiss,
}: HighlightCardProps) {
  const accent = SLOT_ACCENT[item.slot];

  return (
    <li
      className={
        "bcc-panel relative overflow-hidden transition-all duration-200 ease-out " +
        (isExiting
          ? "motion-safe:opacity-0 motion-safe:scale-95 motion-safe:-translate-x-2"
          : "opacity-100")
      }
      style={{ paddingLeft: "16px" }}
    >
      {/* Slot-color accent bar — left edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[4px]"
        style={{ background: accent.bar }}
      />

      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className="bcc-mono text-[9px] tracking-[0.18em]"
            style={{ color: accent.bar }}
          >
            {accent.label}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isDismissing}
            className="bcc-mono text-[10px] text-ink-soft/70 hover:text-ink disabled:opacity-50"
            aria-label="Dismiss highlight"
          >
            {isDismissing ? "…" : "✕"}
          </button>
        </div>

        <h3 className="bcc-stencil text-base text-ink">{item.title}</h3>
        <p className="font-serif text-sm text-ink-soft">{item.body}</p>

        <Link
          href={item.cta.href as Route}
          className="bcc-mono mt-1 self-start text-[10px] text-blueprint hover:underline"
        >
          {item.cta.label} →
        </Link>
      </div>
    </li>
  );
}
