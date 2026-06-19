/**
 * RankChip — the canonical "rank flavored by tier" identity chip.
 *
 * Renders the user's rank (`Apprentice`/`Journeyman`/`Master`) as the
 * single visible word on a transparent, card-like pill, preceded by a
 * small colored TRUST DOT for the §C1 reputation tier. The tier is not a
 * competing word — the dot carries it as color; the rank carries the
 * meaning. Dot first, then rank.
 *
 * Visual hierarchy (load-bearing):
 *   - rank = primary → uppercase word, dominant in the chip
 *   - tier = supporting → the leading dot (glows for caution/trusted/
 *     elite; calm/no-glow for neutral), atmospheric
 *
 * Accessibility: the tier_label is announced to screen readers via an
 * `sr-only` prefix and exposed as a `title` tooltip. Sighted users see
 * the rank word; the tier comes through as the dot color.
 *
 * For `card_tier: null` (unknown / no tier yet) the dot falls back to a
 * neutral grey with no glow so the rank still ships — no false risk
 * signal. The true risky-RED dot needs an explicit server tier (see the
 * backend handover); see TIER_DOT below for the colour rationale.
 */

import type { CardTier } from "@/lib/api/types";

type RankChipSize = "default" | "compact" | "micro";

interface RankChipProps {
  /** §C1 card-tier slug, or null for risky-tier users (no tier accent). */
  cardTier: CardTier;
  /** Pre-rendered §A2 tier display string ("Uncommon", etc.) — used for sr-only + tooltip only. */
  tierLabel: string | null;
  /**
   * Pre-rendered rank display string ("Journeyman", etc.). When empty
   * the component renders nothing — caller doesn't need to guard.
   */
  rankLabel: string;
  /**
   * "default" — profile hero (11px text, 6px rail).
   * "compact" — directory rows / member cards (10px text, 4px rail).
   * "micro" — composer identity header, sized to sit beside a name
   * line without exceeding the avatar's height (9px text, 3px rail).
   * All sizes keep the rail proportionally smaller than the rank word.
   */
  size?: RankChipSize;
  className?: string;
}

// Tier DOT — overrides the Sprint-4 "no per-tier color" decision (read
// docs/Sprint-4-audit). That pass removed color because it imported
// NFT-rarity / collectible-scarcity reading ("we don't rank people").
// This dot is a DIFFERENT signal: a trust/RISK band (red = be cautious
// of this user/page → gold = elite), not a scarcity palette. The colors
// are the semantic --bcc-trust-* ramp, never the --bcc-tier-* rarity set.
//
// Keyed by card_tier (the prop we receive). card_tier ⇆ reputation band:
// legendary=elite, rare=trusted, uncommon=neutral, common=caution.
// `null` card_tier = unknown / no-tier-yet → neutral grey, NO glow. The
// true risky-RED dot needs the server to send an explicit reputation
// tier (FeedAuthor doesn't always ship one) — see the backend handover.
const TIER_DOT: Record<NonNullable<CardTier>, { color: string; glow: boolean }> = {
  legendary: { color: "var(--bcc-trust-elite)",   glow: true  },
  rare:      { color: "var(--bcc-trust-trusted)",  glow: true  },
  uncommon:  { color: "var(--bcc-trust-neutral)",  glow: false },
  common:    { color: "var(--bcc-trust-caution)",  glow: true  },
};

const NO_TIER_DOT = { color: "var(--bcc-trust-neutral)", glow: false };

const SIZE_STYLES: Record<RankChipSize, { dot: number; gap: string; pad: string; font: string }> = {
  default: { dot: 7, gap: "gap-1.5", pad: "py-[3px] pl-1.5 pr-2.5", font: "text-[11px]" },
  compact: { dot: 6, gap: "gap-1.5", pad: "py-[2px] pl-1.5 pr-2",   font: "text-[10px]" },
  micro:   { dot: 5, gap: "gap-1",   pad: "py-0 pl-1 pr-1.5",        font: "text-[9px]"  },
};

export function RankChip({
  cardTier,
  tierLabel,
  rankLabel,
  size = "default",
  className,
}: RankChipProps) {
  if (rankLabel === "") {
    return null;
  }

  const sizeStyles = SIZE_STYLES[size];
  const dot = cardTier !== null ? TIER_DOT[cardTier] : NO_TIER_DOT;

  return (
    <span
      className={[
        "bcc-mono inline-flex items-center rounded-full border border-[var(--bcc-border)] bg-transparent text-[var(--bcc-text)] tracking-[0.18em]",
        sizeStyles.gap,
        sizeStyles.pad,
        sizeStyles.font,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={tierLabel !== null ? `${tierLabel} reputation tier` : undefined}
    >
      {tierLabel !== null && (
        <span className="sr-only">{tierLabel} reputation tier — </span>
      )}
      <span
        aria-hidden
        style={{
          width: sizeStyles.dot,
          height: sizeStyles.dot,
          borderRadius: "9999px",
          background: dot.color,
          flexShrink: 0,
          boxShadow: dot.glow ? `0 0 5px ${dot.color}` : undefined,
        }}
      />
      {rankLabel.toUpperCase()}
    </span>
  );
}
