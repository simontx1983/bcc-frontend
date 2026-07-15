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

import { useState, type MouseEvent } from "react";

import { StokeFlame } from "@/components/feed/StokeFlame";
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
  1: { size: 22, color: "var(--bcc-secondary-dark)",  glowOpacity: 0.12 },
  2: { size: 23, color: "var(--bcc-secondary-dark)",  glowOpacity: 0.20 },
  3: { size: 24, color: "var(--bcc-secondary)",       glowOpacity: 0.28 },
  4: { size: 25, color: "var(--bcc-secondary-light)", glowOpacity: 0.38 },
  5: { size: 26, color: "var(--bcc-secondary-light)", glowOpacity: 0.48 },
};

/** Box the flame + glow are centered in — sized to the largest stage so the icon never clips. */
const FLAME_BOX = 26;

/** No heat_stage at all (backend not shipped) — distinct from "stage 1", which is a real (if cold) signal. */
const FALLBACK_LIT: StagePreset = { size: 22, color: "var(--bcc-stoke-ash)", glowOpacity: 0.25 };
const FALLBACK_DIM: StagePreset = { size: 22, color: "var(--bcc-stoke-ash)", glowOpacity: 0.12 };

/** Radial spread for the stoke-ON spark burst — evenly fanned so they never stack. */
const PARTICLE_RADIUS = 18;

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
      className="bcc-stoke-button relative inline-flex min-h-[28px] items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-150 hover:bg-[var(--bcc-surface-active)] disabled:cursor-not-allowed"
    >
      <StokeFlame
        boxSize={FLAME_BOX}
        flameSize={preset.size}
        color={preset.color}
        outline={!hasStoked}
        glowOpacity={preset.glowOpacity}
        burstKey={burstKey}
        particleRadius={PARTICLE_RADIUS}
      />
      <span
        className="bcc-mono text-[11px]"
        style={{ color: hasStoked ? preset.color : "var(--bcc-text-secondary)" }}
      >
        Stoke{count > 0 ? ` ${count}` : ""}
      </span>
    </button>
  );
}

/** Fallback signal when `heat_stage` hasn't shipped: any existing reaction count at all lights the flame. */
function hasAnyLegacyEngagement(item: FeedItem): boolean {
  return Object.values(item.reactions.counts).some((count) => count > 0);
}
