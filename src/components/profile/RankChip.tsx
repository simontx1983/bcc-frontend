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
 * Canonical color source is `reputationTier` (the real 5-band axis,
 * including a true risky-RED dot). `cardTier` is a legacy fallback for
 * the handful of card-only view-models with no `reputation_tier` field —
 * see DOT_BY_REPUTATION_TIER / TIER_DOT below for the split rationale.
 */

"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { RankInfoModal } from "@/components/identity/RankInfoModal";
import type { CardTier, ReputationTier } from "@/lib/api/types";

type RankChipSize = "default" | "compact" | "micro";

interface RankChipProps {
  /**
   * §C1 card-tier slug, or null for risky-tier users (no tier accent).
   * Legacy fallback — only consulted when `reputationTier` is omitted.
   * Card-only view-models (directory/search suggestion surfaces) have no
   * `reputation_tier` field at all and still rely on this path.
   */
  cardTier?: CardTier;
  /**
   * The canonical trust-band signal (`risky | caution | neutral | trusted
   * | elite`), already server-resolved. Takes priority over `cardTier`
   * when present (including explicitly `null` — "no tier data yet") since
   * it's the only path that can render the true risky-red dot (`cardTier`
   * is always `null` for risky by design — see TIER_DOT below). Prefer
   * this prop for any new caller.
   */
  reputationTier?: ReputationTier | null;
  /** Pre-rendered §A2 tier display string ("Uncommon", etc.) — used for sr-only + tooltip only. */
  tierLabel: string | null;
  /**
   * Pre-rendered rank display string ("Journeyman", etc.). When empty
   * the component renders nothing — caller doesn't need to guard.
   */
  rankLabel: string;
  /**
   * Foreman is a conferred role, not a rank rung or trust tier (see
   * docs/trust-rank redesign notes) — a permanent purple star marker +
   * chip border layered on top of whatever rank/tier the member also
   * carries. The star (not a plain dot) is deliberate — it needs to read
   * as its own signal at a glance, not just another tier color.
   */
  isForeman?: boolean;
  /**
   * "default" — profile hero (11px text, 6px rail).
   * "compact" — directory rows / member cards (10px text, 4px rail).
   * "micro" — composer identity header, sized to sit beside a name
   * line without exceeding the avatar's height (9px text, 3px rail).
   * All sizes keep the rail proportionally smaller than the rank word.
   */
  size?: RankChipSize;
  className?: string;
  /**
   * When set, the chip becomes a button that opens the Rank & Trust
   * explainer modal (RankInfoModal) for this member. Omitted → the chip
   * is inert display only (directory rows, member cards, etc.).
   */
  handle?: string;
  /**
   * When provided, a click calls this instead of opening the modal via
   * local state — used by AvatarHovercard/MentionHovercard, which own
   * the modal themselves (rendered as a sibling of the hovercard, not a
   * descendant of this chip) specifically so it survives the hovercard
   * closing. A modal rendered here as RankChip's own child would unmount
   * along with it the instant the hovercard above it closes — which is
   * exactly the "click closes the card, opens the modal" behavior this
   * exists to support: the two need to become independent of each
   * other's lifecycle, not just of each other's timing. Omitted → RankChip
   * manages the modal itself (PostDetail sidebar, directory rows, etc.),
   * unchanged from before.
   */
  onOpenRankInfo?: () => void;
}

// Tier DOT — overrides the Sprint-4 "no per-tier color" decision (read
// docs/Sprint-4-audit). That pass removed color because it imported
// NFT-rarity / collectible-scarcity reading ("we don't rank people").
// This dot is a DIFFERENT signal: a trust/RISK band (red = be cautious
// of this user/page → gold = elite), not a scarcity palette. The colors
// are the semantic --bcc-trust-* ramp, never the --bcc-tier-* rarity set.
//
// Canonical: keyed directly by reputation_tier (the real 5-band axis).
// Covers `risky`, which `cardTier` structurally cannot represent (the
// server maps risky → card_tier:null so risky entities are hidden from
// card-collecting UI — see ReputationTierMap::TIER_TO_CARD). Prefer this
// map whenever the caller has a real `reputation_tier`.
const DOT_BY_REPUTATION_TIER: Record<ReputationTier, { color: string; glow: boolean }> = {
  risky:   { color: "var(--bcc-trust-risky)",   glow: true  },
  caution: { color: "var(--bcc-trust-caution)", glow: true  },
  neutral: { color: "var(--bcc-trust-neutral)", glow: false },
  trusted: { color: "var(--bcc-trust-trusted)", glow: true  },
  elite:   { color: "var(--bcc-trust-elite)",   glow: true  },
};

// Legacy fallback — only consulted when the caller has no reputationTier
// at all (card-only view-models: directory/search-suggestion surfaces).
// Keyed by card_tier ⇆ reputation band: legendary=elite, rare=trusted,
// uncommon=neutral, common=caution. `null`/absent → neutral grey, no glow.
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
  reputationTier,
  tierLabel,
  rankLabel,
  isForeman = false,
  size = "default",
  className,
  handle,
  onOpenRankInfo,
}: RankChipProps) {
  const [open, setOpen] = useState(false);

  if (rankLabel === "") {
    return null;
  }

  const sizeStyles = SIZE_STYLES[size];
  // Canonical path: a real reputationTier (even explicitly null) always
  // wins over the legacy cardTier translation — see DOT_BY_REPUTATION_TIER
  // doc comment above for why cardTier can't represent risky.
  const dot =
    reputationTier !== undefined
      ? reputationTier !== null
        ? DOT_BY_REPUTATION_TIER[reputationTier]
        : NO_TIER_DOT
      : cardTier !== undefined && cardTier !== null
        ? TIER_DOT[cardTier]
        : NO_TIER_DOT;

  const baseClass = [
    "bcc-mono inline-flex items-center rounded-full border bg-transparent text-[var(--bcc-text)] tracking-[0.18em]",
    isForeman ? "border-[var(--bcc-trust-foreman)]" : "border-[var(--bcc-border)]",
    sizeStyles.gap,
    sizeStyles.pad,
    sizeStyles.font,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
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
      {isForeman && (
        <>
          <span title="Foreman — conferred role" style={{ display: "inline-flex", flexShrink: 0 }}>
            <Star
              aria-hidden
              size={sizeStyles.dot + 4}
              fill="var(--bcc-trust-foreman)"
              stroke="var(--bcc-trust-foreman)"
              strokeWidth={1}
            />
          </span>
          <span className="sr-only"> — Foreman, a conferred role</span>
        </>
      )}
    </>
  );

  // Inert display (directory rows, member cards) when no handle.
  if (handle === undefined) {
    return (
      <span
        className={baseClass}
        title={tierLabel !== null ? `${tierLabel} reputation tier` : undefined}
      >
        {inner}
      </span>
    );
  }

  // Interactive: the whole pill opens the Rank & Trust explainer. stop
  // propagation + preventDefault so a click doesn't also trigger an
  // enclosing card link / row navigation.
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onOpenRankInfo !== undefined) {
            onOpenRankInfo();
          } else {
            setOpen(true);
          }
        }}
        aria-haspopup="dialog"
        data-bcc-tour="rankchip.trigger"
        title={
          tierLabel !== null
            ? `${tierLabel} reputation tier — what does this mean?`
            : "Rank & trust — what does this mean?"
        }
        className={`${baseClass} cursor-pointer transition-colors hover:border-[var(--bcc-accent)] hover:text-[var(--bcc-accent)]`}
      >
        {inner}
      </button>
      {/* Only self-manages the modal when the caller hasn't taken ownership
          of it (see onOpenRankInfo doc). */}
      {onOpenRankInfo === undefined && open && (
        <RankInfoModal
          handle={handle}
          cardTier={cardTier ?? null}
          tierLabel={tierLabel}
          rankLabel={rankLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
