"use client";

/**
 * CelebrationToast — §O1.2 Heavy intensity moment.
 *
 * Renders the brand-color sweep + a centered toast with the server-
 * supplied label. The component is presentation-only: lifecycle (when
 * to mount, when to consume) lives in <CelebrationGate>.
 *
 * The card follows the same scale-in / hold / lift visual as the §O1
 * onboarding stat-pop so a user gets a consistent rhythm: the first
 * card animation they see at signup is the same shape as every later
 * promotion. Reduced-motion preference falls back to a static toast
 * (still surfaced; just not animated) — see globals.css.
 *
 * Icon mapping is intentionally light — one inline SVG per known
 * `kind`, with a generic chevron-up fallback for unknown kinds we
 * haven't shipped UI for yet (level_up, tier_upgrade are reserved
 * but not yet produced server-side).
 */

import { useEffect } from "react";

import type { Celebration } from "@/lib/api/types";

interface CelebrationToastProps {
  celebration: Celebration;
  /**
   * Fires after the animation has had time to play (1500ms). The
   * gate uses this signal to call /me/celebrations/consume and to
   * unmount the toast — render-then-consume keeps the celebration
   * recoverable if the tab crashes mid-render.
   */
  onComplete: () => void;
}

const ANIMATION_MS = 1500;

export function CelebrationToast({ celebration, onComplete }: CelebrationToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onComplete, ANIMATION_MS);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <>
      <div aria-hidden className="bcc-celebration-sweep" />

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-6"
      >
        <div className="bcc-celebration-toast bcc-panel pointer-events-auto flex max-w-md flex-col items-center gap-3 px-8 py-7 text-center shadow-2xl">
          <CelebrationIcon kind={celebration.kind} />

          <span
            className="bcc-mono text-[10px] tracking-[0.24em]"
            style={{ color: "var(--verified)" }}
          >
            {labelForKind(celebration.kind)}
          </span>

          <h2 className="bcc-stencil text-2xl text-ink md:text-3xl">
            {celebration.label}
          </h2>
        </div>
      </div>
    </>
  );
}

function labelForKind(kind: Celebration["kind"]): string {
  switch (kind) {
    case "rank_up":
      return "RANK UP";
    case "level_up":
      return "LEVEL UP";
    case "tier_upgrade":
      return "TIER UPGRADE";
    default:
      return "EARNED";
  }
}

function CelebrationIcon({ kind }: { kind: Celebration["kind"] }) {
  // Single SVG family — chevron-up sits inside a small circle. Color
  // mirrors the sweep so the eye reads the moment as a single signal.
  // Future kinds (tier_upgrade) can branch here without disturbing
  // the rank_up rendering.
  void kind;
  return (
    <span
      aria-hidden
      className="inline-flex h-12 w-12 items-center justify-center rounded-full"
      style={{
        background: "rgba(44,157,102,0.12)",
        border: "1px solid rgba(44,157,102,0.45)",
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--verified)" }}
      >
        <polyline points="6 15 12 9 18 15" />
      </svg>
    </span>
  );
}
