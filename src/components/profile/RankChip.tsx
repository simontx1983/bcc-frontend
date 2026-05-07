/**
 * RankChip — the canonical "rank flavored by tier" identity chip.
 *
 * Renders the user's rank (`Apprentice`/`Journeyman`/`Foreman`) as the
 * single visible word on a cardstock-deep body, with the §C1 reputation
 * tier (`legendary`/`rare`/`uncommon`/`common`) demoted to a colored
 * left rail. The tier is no longer rendered as a competing word — it
 * tints the chip, the rank carries the meaning.
 *
 * Visual hierarchy (load-bearing):
 *   - rank = primary → bold uppercase word, dominant in the chip
 *   - tier = supporting → colored stripe on the left edge, atmospheric
 * Sizing scales the stripe with the chip so the rank stays
 * proportionally larger across surfaces (default vs compact). Don't
 * widen the stripe past ~30% of chip height — the chip drifts toward
 * "two labels smashed together" instead of "rank flavored by tier."
 *
 * Accessibility: the tier_label is announced to screen readers via an
 * `sr-only` prefix and exposed as a `title` tooltip. Sighted users only
 * see the rank word; the tier comes through as color.
 *
 * For risky-tier users (`card_tier: null`), the stripe falls back to a
 * neutral cardstock border so the rank still ships — no information
 * loss, just no tier signal (which §C1 hides anyway).
 */

import type { CardTier } from "@/lib/api/types";

type RankChipSize = "default" | "compact";

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
   * Both keep the rail proportionally smaller than the rank word.
   */
  size?: RankChipSize;
  className?: string;
}

const RAIL_BY_TIER: Record<NonNullable<CardTier>, string> = {
  legendary: "border-l-tier-legendary",
  rare:      "border-l-tier-rare",
  uncommon:  "border-l-tier-uncommon",
  common:    "border-l-tier-common",
};

const SIZE_STYLES: Record<RankChipSize, { rail: string; pad: string; font: string }> = {
  default: {
    rail: "border-l-[6px]",
    pad:  "py-[3px] pl-2 pr-2",
    font: "text-[11px]",
  },
  compact: {
    rail: "border-l-[4px]",
    pad:  "py-[3px] pl-1.5 pr-2",
    font: "text-[10px]",
  },
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
  const rail =
    cardTier !== null ? RAIL_BY_TIER[cardTier] : "border-l-cardstock/30";

  return (
    <span
      className={[
        "bcc-mono inline-flex items-center bg-cardstock-deep text-ink",
        sizeStyles.pad,
        sizeStyles.font,
        sizeStyles.rail,
        rail,
        "tracking-[0.18em]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={tierLabel !== null ? `${tierLabel} reputation tier` : undefined}
    >
      {tierLabel !== null && (
        <span className="sr-only">{tierLabel} reputation tier — </span>
      )}
      {rankLabel.toUpperCase()}
    </span>
  );
}
