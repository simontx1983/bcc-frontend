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
 * Color source is `reputationTier` — the 5-band axis, risky-RED dot
 * included. The `cardTier` fallback that used to sit beside it was removed
 * in v1.56 along with the rarity vocabulary; see DOT_BY_REPUTATION_TIER.
 */

"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { RankInfoModal } from "@/components/identity/RankInfoModal";
import type { ReputationTier } from "@/lib/api/types";

type RankChipSize = "default" | "compact" | "micro";

interface RankChipProps {
  /**
   * The trust-band signal (`risky | caution | neutral | trusted | elite`),
   * already server-resolved.
   *
   * REQUIRED as of v1.56. It was optional, with a `cardTier` fallback for
   * view-models that shipped no reputation_tier — and that fallback could
   * not express `risky` at all, so those surfaces rendered a risky member
   * as neutral grey. Making it required is what forces every caller to
   * carry the real band.
   */
  reputationTier: ReputationTier;
  /** Pre-rendered §A2 tier display string ("Trusted", etc.) — used for sr-only + tooltip only. */
  tierLabel: string;
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
// are the semantic --bcc-trust-* ramp (the rarity set is retired).
//
// Keyed directly by reputation_tier — the only tier axis as of v1.56.
//
// A `cardTier` fallback used to sit beside this for card-only view-models
// that shipped no reputation_tier. It is gone: the rarity slugs it consumed
// are retired, and it was structurally incapable of showing `risky` (the
// server mapped risky → card_tier:null), so any surface that fell back to
// it rendered the product's most safety-relevant state as neutral grey.
// The server now emits reputation_tier on every author and card surface.
const DOT_BY_REPUTATION_TIER: Record<ReputationTier, { color: string; glow: boolean }> = {
  risky:   { color: "var(--bcc-trust-risky)",   glow: true  },
  caution: { color: "var(--bcc-trust-caution)", glow: true  },
  neutral: { color: "var(--bcc-trust-neutral)", glow: false },
  trusted: { color: "var(--bcc-trust-trusted)", glow: true  },
  elite:   { color: "var(--bcc-trust-elite)",   glow: true  },
};

const SIZE_STYLES: Record<RankChipSize, { dot: number; gap: string; pad: string; font: string }> = {
  default: { dot: 7, gap: "gap-1.5", pad: "py-[3px] pl-1.5 pr-2.5", font: "text-[11px]" },
  compact: { dot: 6, gap: "gap-1.5", pad: "py-[2px] pl-1.5 pr-2",   font: "text-[10px]" },
  micro:   { dot: 5, gap: "gap-1",   pad: "py-0 pl-1 pr-1.5",        font: "text-[9px]"  },
};

export function RankChip({
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
  // One path, no fallback: reputationTier is required, so every chip
  // resolves a real band. The old two-branch resolution existed only to
  // cope with view-models that shipped no reputation_tier, and its
  // fallback silently rendered them — risky included — as neutral grey.
  const dot = DOT_BY_REPUTATION_TIER[reputationTier];

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
          reputationTier={reputationTier}
          tierLabel={tierLabel}
          rankLabel={rankLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
