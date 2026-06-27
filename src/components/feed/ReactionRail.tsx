"use client";

/**
 * ReactionRail — Stoke, the single forge-fire reaction.
 *
 * Replaces the v1.5 layered grammar (Solid/Stand-behind + Like/Love/
 * Haha/Wow/Fire) entirely. Vouch is NOT here — it relocated to the
 * per-author byline toggle (AuthorVouchButton, rendered in AuthorBadge)
 * in the Phase γ cleanup and stays there.
 *
 * Stoke is cosmetic for trust (never moves a score) but a real feed-
 * ranking input. The rail renders `item.reactions.heat_stage` (1-5,
 * velocity-weighted, server-computed) as static size/brightness/glow —
 * no idle animation. Motion is invited, never ambient:
 *   - desktop hover flickers the flame (gated on `(hover: hover)` in
 *     globals.css so a tap-to-hover touch browser can't get stuck)
 *   - tap stokes once + a small bump/spark
 *   - double-tap ON THE ICON fires a bigger decaying flourish — it
 *     never leaves the flame showing a higher stage than the real
 *     heat; the flourish is a one-shot CSS animation that reverts to
 *     the static resting stage the instant it ends
 *
 * Fallback: when `heat_stage` is absent (backend not shipped yet), the
 * rail renders a flat lit/unlit flame from whatever legacy reaction
 * counts already exist — never throws, never blanks the rail.
 */

import { useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { useStokeMutation } from "@/hooks/useStoke";
import type { FeedItem, HeatStage } from "@/lib/api/types";

const STOKE_CAP = 5;
const DOUBLE_TAP_WINDOW_MS = 350;

interface StagePreset {
  /** Flame icon box size, px. */
  size: number;
  /** Flame fill — always the brand forge-orange scale, never the theme-switchable accent. */
  color: string;
  /** Resting (non-hover, non-flourish) glow opacity. */
  restGlowOpacity: number;
}

const STAGE_PRESETS: Record<HeatStage, StagePreset> = {
  1: { size: 17, color: "var(--bcc-secondary-dark)",  restGlowOpacity: 0.12 },
  2: { size: 20, color: "var(--bcc-secondary-dark)",  restGlowOpacity: 0.20 },
  3: { size: 23, color: "var(--bcc-secondary)",       restGlowOpacity: 0.32 },
  4: { size: 26, color: "var(--bcc-secondary-light)", restGlowOpacity: 0.45 },
  5: { size: 30, color: "var(--bcc-secondary-light)", restGlowOpacity: 0.60 },
};

const FALLBACK_LIT: StagePreset = { size: 20, color: "var(--bcc-secondary)", restGlowOpacity: 0.25 };
const FALLBACK_DIM: StagePreset = { size: 18, color: "var(--bcc-secondary-dark)", restGlowOpacity: 0.10 };

/** Radial spread for the spark particles, varied per-index so they fan out rather than stack. */
const PARTICLE_OFFSETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: -10, y: -14 },
  { x: 10, y: -14 },
  { x: -16, y: -2 },
  { x: 16, y: -2 },
  { x: 0, y: -18 },
];

export function ReactionRail({
  item,
  canInteract = true,
}: {
  item: FeedItem;
  /**
   * When false, the icon still renders the read-only heat stage but is
   * disabled — drives the §4.7.6 non-member group teaser. Defaults to
   * true so every other feed surface is unchanged.
   */
  canInteract?: boolean;
}) {
  const stokeMut = useStokeMutation();
  const heatStage = item.reactions.heat_stage;
  const viewerStokeCount = item.reactions.viewer_stoke_count ?? 0;
  const atCap = heatStage !== undefined && viewerStokeCount >= STOKE_CAP;
  const disabled = stokeMut.isPending || !canInteract || atCap;

  const preset =
    heatStage !== undefined
      ? STAGE_PRESETS[heatStage]
      : hasAnyLegacyEngagement(item)
        ? FALLBACK_LIT
        : FALLBACK_DIM;

  const lastTapAtRef = useRef(0);
  const [flourish, setFlourish] = useState<{ kind: "tap" | "burst"; key: number } | null>(null);

  const handleTap = (event: MouseEvent<HTMLButtonElement>) => {
    // Stop propagation so the card's whole-body click-to-navigate
    // handler never sees this — though it already excludes `button`
    // targets, this keeps the double-tap gesture unambiguously scoped
    // to the icon, never the card or (in the detail view) the body.
    event.stopPropagation();
    if (disabled) return;

    const now = Date.now();
    const isDoubleTap = now - lastTapAtRef.current < DOUBLE_TAP_WINDOW_MS;
    lastTapAtRef.current = now;

    setFlourish((prev) => ({ kind: isDoubleTap ? "burst" : "tap", key: (prev?.key ?? 0) + 1 }));
    stokeMut.mutate(item.id);
  };

  const isBurst = flourish?.kind === "burst";
  const particleCount = isBurst ? PARTICLE_OFFSETS.length : 2;

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={atCap ? "Stoked — you've reached the cap on this post" : "Stoke"}
      title={atCap ? "Stoked — max reached" : "Stoke"}
      className="bcc-stoke-button relative inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full disabled:cursor-not-allowed"
    >
      <span
        aria-hidden
        className="bcc-stoke-glow pointer-events-none absolute rounded-full"
        style={
          {
            width: preset.size * 2.2,
            height: preset.size * 2.2,
            background: "var(--bcc-secondary-glow)",
            filter: "blur(6px)",
            opacity: preset.restGlowOpacity,
            transition: "opacity 200ms ease",
            "--bcc-stoke-hover-opacity": Math.min(1, preset.restGlowOpacity + 0.35),
          } as CSSProperties
        }
      />
      {flourish !== null && isBurst && (
        <span
          key={`burst-glow-${flourish.key}`}
          aria-hidden
          className="bcc-stoke-burst-glow pointer-events-none absolute rounded-full motion-safe:animate-[bcc-stoke-burst-glow_650ms_ease-out]"
          style={{
            width: preset.size * 2.8,
            height: preset.size * 2.8,
            background: "var(--bcc-secondary-glow)",
            filter: "blur(8px)",
          }}
        />
      )}
      <FlameIcon
        key={`flame-${flourish?.key ?? 0}`}
        size={preset.size}
        color={preset.color}
        className={
          "bcc-stoke-flame " +
          (flourish === null
            ? ""
            : isBurst
              ? "motion-safe:animate-[bcc-stoke-burst-scale_650ms_ease-out]"
              : "motion-safe:animate-[bcc-count-bump_280ms_ease-out]")
        }
      />
      {flourish !== null &&
        Array.from({ length: particleCount }, (_, i) => {
          const offset = PARTICLE_OFFSETS[i % PARTICLE_OFFSETS.length] ?? { x: 0, y: -12 };
          const scale = isBurst ? 1.4 : 0.8;
          return (
            <span
              key={`particle-${flourish.key}-${i}`}
              aria-hidden
              className="pointer-events-none absolute h-1 w-1 rounded-full motion-safe:animate-[bcc-stoke-particle_550ms_ease-out]"
              style={
                {
                  background: "var(--bcc-secondary-light)",
                  "--bcc-stoke-particle-x": `${offset.x * scale}px`,
                  "--bcc-stoke-particle-y": `${offset.y * scale}px`,
                } as CSSProperties
              }
            />
          );
        })}
    </button>
  );
}

/** Fallback signal when `heat_stage` hasn't shipped: any existing reaction count at all lights the flame. */
function hasAnyLegacyEngagement(item: FeedItem): boolean {
  return Object.values(item.reactions.counts).some((count) => count > 0);
}

function FlameIcon({
  size,
  color,
  className = "",
}: {
  size: number;
  color: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      style={{ transition: "width 200ms ease, height 200ms ease" }}
    >
      <path
        d="M12 2c1.2 2.6-0.4 4-1.4 5.4C9.4 8.8 8 10.4 8 12.8c0 .9.2 1.7.6 2.4-1-.5-1.8-1.4-2.2-2.6-.7 1-1.1 2.2-1.1 3.5 0 3.3 2.9 6 6.7 6s6.7-2.7 6.7-6c0-2.6-1-4.3-2.3-5.9.1.8.1 1.6-.1 2.3-.4-2.6-1.9-4.6-3.5-6.2C13.6 5.3 12.7 3.7 12 2Z"
        fill={color}
      />
    </svg>
  );
}
