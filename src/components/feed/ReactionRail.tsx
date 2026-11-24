"use client";

/**
 * ReactionRail — Stoke, the single forge-fire reaction. X-"like" model.
 *
 * Replaces the v1.5 layered grammar (Solid/Back + Like/Love/
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
 *
 * F-258 (audit M5): a signed-out visitor's tap showed the burst and then
 * the 401 rolled it back without a word. Signed out, the pill is now a
 * sign-in link with the same look, and a failed toggle says so in a line
 * under the action row (ReactionFailureNotice).
 */

import { useSession } from "next-auth/react";
import { useState, type MouseEvent } from "react";

import {
  ReactionFailureNotice,
  ReactionSignInLink,
  REACTION_COPY,
  useReactionFailure,
} from "@/components/feed/ReactionFailureNotice";
import { StokeFlame } from "@/components/feed/StokeFlame";
import { stokeAccessibleName } from "@/components/feed/stoke-name";
import { useStokeMutation, useUnstokeMutation } from "@/hooks/useStoke";
import type { FeedItem, HeatStage } from "@/lib/api/types";
import { HIT_AREA_44 } from "@/components/feed/hitArea";

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
  2: { size: 19, color: "var(--bcc-secondary-dark)",  glowOpacity: 0.20 },
  3: { size: 20, color: "var(--bcc-secondary)",       glowOpacity: 0.28 },
  4: { size: 21, color: "var(--bcc-secondary-light)", glowOpacity: 0.38 },
  5: { size: 22, color: "var(--bcc-secondary-light)", glowOpacity: 0.48 },
};

/** Box the flame + glow are centered in — sized to the largest stage so the icon never clips. */
const FLAME_BOX = 22;

/** No heat_stage at all (backend not shipped) — distinct from "stage 1", which is a real (if cold) signal. */
const FALLBACK_LIT: StagePreset = { size: 18, color: "var(--bcc-stoke-ash)", glowOpacity: 0.25 };
const FALLBACK_DIM: StagePreset = { size: 18, color: "var(--bcc-stoke-ash)", glowOpacity: 0.12 };

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
  const failure = useReactionFailure();
  // Only a settled "unauthenticated" swaps in the link: while the session
  // loads, a signed-in viewer must not see the pill flash to "Sign in".
  const signedOut = useSession().status === "unauthenticated";
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
    failure.clear();

    if (hasStoked) {
      unstokeMut.mutate(item.id, { onError: (err) => failure.report(err, "stoke", true) });
      return;
    }
    setBurstKey((k) => k + 1);
    stokeMut.mutate(item.id, { onError: (err) => failure.report(err, "stoke", false) });
  };

  const pillClass = `${HIT_AREA_44} bcc-stoke-button inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors duration-150 hover:bg-[var(--bcc-surface-active)]`;
  const flame = (
    <StokeFlame
      boxSize={FLAME_BOX}
      flameSize={preset.size}
      color={preset.color}
      outline={!hasStoked}
      glowOpacity={preset.glowOpacity}
      burstKey={burstKey}
      particleRadius={PARTICLE_RADIUS}
    />
  );
  const label = (
    <span
      className="bcc-mono text-[11px]"
      style={{ color: hasStoked ? preset.color : "var(--bcc-text-secondary)" }}
    >
      <span className="hidden sm:inline">Stoke</span>
      {count > 0 ? ` ${count}` : ""}
    </span>
  );

  // The non-member group teaser (canInteract=false) stays a read-only pill
  // for everyone: its "join to interact" lives once on GroupFeedSection.
  if (signedOut && canInteract) {
    return (
      <ReactionSignInLink label={REACTION_COPY.stoke.signIn} className={pillClass}>
        {flame}
        {label}
      </ReactionSignInLink>
    );
  }

  // A fragment: the notice is a sibling in PostActionBar's wrapping row,
  // where "order-last basis-full" puts a line under the whole row.
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-disabled={disabled}
        aria-pressed={hasStoked}
        aria-label={stokeAccessibleName(count)}
        title={hasStoked ? "Remove your stoke" : "Stoke"}
        className={`${pillClass} disabled:cursor-not-allowed`}
      >
        {flame}
        {label}
      </button>
      <ReactionFailureNotice failure={failure.failure} className="order-last basis-full" />
    </>
  );
}

/** Fallback signal when `heat_stage` hasn't shipped: any existing reaction count at all lights the flame. */
function hasAnyLegacyEngagement(item: FeedItem): boolean {
  return Object.values(item.reactions.counts).some((count) => count > 0);
}
