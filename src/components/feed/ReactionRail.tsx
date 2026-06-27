"use client";

/**
 * ReactionRail — Stoke, the single forge-fire reaction. X-"like" model.
 *
 * Replaces the v1.5 layered grammar (Solid/Stand-behind + Like/Love/
 * Haha/Wow/Fire) entirely. Vouch is NOT here — it relocated to the
 * per-author byline toggle (AuthorVouchButton, rendered in AuthorBadge)
 * in the Phase γ cleanup and stays there.
 *
 * Stoke is cosmetic for trust (never moves a score) but a real feed-
 * ranking input. Two orthogonal axes, both server-driven:
 *   - FILL = personal (`viewer_has_stoked`, boolean) — ash outline when
 *     you haven't stoked, solid forge-orange when you have. One stoke
 *     per person; click toggles. No multi-stoke, no cap, no double-tap.
 *   - HEAT = aggregate (`heat_stage`, 1-5, velocity-weighted + time-
 *     decayed) — everyone sees the same glow/color-temperature/size,
 *     independent of whether THIS viewer has stoked. A hot post you
 *     haven't stoked still glows warm as an outline.
 *
 * A richer spark burst fires on stoke-ON only; unstoke is silent (the
 * fill just drains back to ash). Desktop-only hover flicker is gated
 * on `(hover: hover)` in globals.css so a tap-to-hover touch browser
 * can't get stuck mid-flicker.
 *
 * Fallback: when `heat_stage`/`viewer_has_stoked`/`stoke_count` are
 * absent (backend not shipped yet), the rail renders a flat ash/lit
 * flame from whatever legacy reaction counts already exist — never
 * throws, never blanks the rail.
 */

import { useState, type CSSProperties, type MouseEvent } from "react";

import { useStokeMutation, useUnstokeMutation } from "@/hooks/useStoke";
import type { FeedItem, HeatStage } from "@/lib/api/types";

interface StagePreset {
  /** Flame icon box size, px — a tight band so the rail stays aligned with its siblings. */
  size: number;
  /** Heat-graded color (dark -> light forge-orange). Used as `stroke` when ash, `fill` when stoked. */
  color: string;
  /** Glow opacity behind the flame — public aggregate signal, independent of personal fill. */
  glowOpacity: number;
}

const STAGE_PRESETS: Record<HeatStage, StagePreset> = {
  1: { size: 18, color: "var(--bcc-secondary-dark)",  glowOpacity: 0.12 },
  2: { size: 19, color: "var(--bcc-secondary-dark)",  glowOpacity: 0.21 },
  3: { size: 20, color: "var(--bcc-secondary)",       glowOpacity: 0.30 },
  4: { size: 21, color: "var(--bcc-secondary-light)", glowOpacity: 0.42 },
  5: { size: 22, color: "var(--bcc-secondary-light)", glowOpacity: 0.55 },
};

/** No heat_stage at all (backend not shipped) — distinct from "stage 1", which is a real (if cold) signal. */
const FALLBACK_LIT: StagePreset = { size: 18, color: "var(--bcc-stoke-ash)", glowOpacity: 0.25 };
const FALLBACK_DIM: StagePreset = { size: 18, color: "var(--bcc-stoke-ash)", glowOpacity: 0.12 };

/** Radial spread for the stoke-ON spark burst — evenly fanned so they never stack. */
const PARTICLE_COUNT = 7;
const PARTICLE_RADIUS = 18;
const PARTICLE_OFFSETS: ReadonlyArray<{ x: number; y: number }> = Array.from(
  { length: PARTICLE_COUNT },
  (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(angle) * PARTICLE_RADIUS), y: Math.round(Math.sin(angle) * PARTICLE_RADIUS) };
  }
);

export function ReactionRail({
  item,
  canInteract = true,
}: {
  item: FeedItem;
  /**
   * When false, the pill still renders the read-only fill + heat but is
   * disabled — drives the §4.7.6 non-member group teaser. Defaults to
   * true so every other feed surface is unchanged.
   */
  canInteract?: boolean;
}) {
  const stokeMut = useStokeMutation();
  const unstokeMut = useUnstokeMutation();
  const heatStage = item.reactions.heat_stage;
  const hasStoked = item.reactions.viewer_has_stoked ?? false;
  const count = item.reactions.stoke_count ?? 0;
  const isPending = stokeMut.isPending || unstokeMut.isPending;
  const disabled = isPending || !canInteract;

  const preset =
    heatStage !== undefined
      ? STAGE_PRESETS[heatStage]
      : hasAnyLegacyEngagement(item)
        ? FALLBACK_LIT
        : FALLBACK_DIM;

  const [burstKey, setBurstKey] = useState(0);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Stop propagation so the card's whole-body click-to-navigate
    // handler never sees this — it already excludes `button` targets,
    // but this keeps the toggle unambiguously scoped to the pill.
    event.stopPropagation();
    if (disabled) return;

    if (hasStoked) {
      unstokeMut.mutate(item.id);
      return;
    }
    setBurstKey((k) => k + 1);
    stokeMut.mutate(item.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={hasStoked}
      aria-label={hasStoked ? "Stoked — tap to remove" : "Stoke"}
      title={hasStoked ? "Stoked — tap to remove" : "Stoke"}
      className="bcc-stoke-button relative inline-flex min-h-[36px] items-center gap-1 rounded-full px-1.5 disabled:cursor-not-allowed"
    >
      <span className="relative inline-flex items-center justify-center" style={{ width: 22, height: 22 }}>
        <span
          aria-hidden
          className="bcc-stoke-glow pointer-events-none absolute rounded-full"
          style={
            {
              width: preset.size * 2.2,
              height: preset.size * 2.2,
              background: "var(--bcc-secondary-glow)",
              filter: "blur(6px)",
              opacity: preset.glowOpacity,
              transition: "opacity 200ms ease",
              "--bcc-stoke-hover-opacity": Math.min(1, preset.glowOpacity + 0.35),
            } as CSSProperties
          }
        />
        {burstKey > 0 && (
          <span
            key={`burst-glow-${burstKey}`}
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
          key={`flame-${burstKey}`}
          size={preset.size}
          color={preset.color}
          outline={!hasStoked}
          className={
            "bcc-stoke-flame " +
            (burstKey > 0 ? "motion-safe:animate-[bcc-stoke-burst-scale_650ms_ease-out]" : "")
          }
        />
        {burstKey > 0 &&
          PARTICLE_OFFSETS.map((offset, i) => (
            <span
              key={`particle-${burstKey}-${i}`}
              aria-hidden
              className="pointer-events-none absolute h-1 w-1 rounded-full motion-safe:animate-[bcc-stoke-particle_650ms_ease-out]"
              style={
                {
                  background: "var(--bcc-secondary-light)",
                  "--bcc-stoke-particle-x": `${offset.x}px`,
                  "--bcc-stoke-particle-y": `${offset.y}px`,
                } as CSSProperties
              }
            />
          ))}
      </span>
      {count > 0 && (
        <span
          className="bcc-mono text-[11px]"
          style={{ color: hasStoked ? preset.color : "var(--bcc-text-secondary)" }}
        >
          {count}
        </span>
      )}
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
  outline,
  className = "",
}: {
  size: number;
  color: string;
  /** true = ash outline (not stoked); false = solid fill (stoked). */
  outline: boolean;
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
        fill={outline ? "none" : color}
        stroke={outline ? color : "none"}
        strokeWidth={outline ? 1.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}
