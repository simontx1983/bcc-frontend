"use client";

/**
 * CardFactory — polymorphic trading-card component (§N2).
 *
 * Renders any §L5 Card view-model regardless of `card_kind`. The
 * server returns presentation-ready fields (`card_tier`,
 * `tier_label`, `crest`, `stats`, `permissions`, `social_proof`);
 * this component does ZERO derivation.
 *
 * Architectural rule (§A2): if a layout decision feels like it
 * needs to look at `trust_score` or `reputation_tier` directly,
 * it doesn't — read `card_tier` (the server already mapped it)
 * or `stats[]` (already formatted strings).
 *
 * What this component owns (presentation only):
 *   - 3D flip on click (front ↔ back face)
 *   - Hover-driven tilt, gated on prefers-reduced-motion
 *   - Foil shimmer overlay for `card_tier === 'legendary'` (§C1)
 *   - Disabled action states with title-tooltip when `permissions.can_X`
 *     is false (§N7 visible-but-dimmed)
 *   - Click-to-flip vs. click-on-action delegation (event.stopPropagation
 *     on action buttons so they don't flip the card)
 *
 * What it doesn't:
 *   - Mutations (Pull / Review / Dispute) — parent passes callbacks
 *     (typed below). Component is testable as pure render.
 *
 * Phase 3.3 split: this file keeps the flip/tilt wrapper + chrome
 * color derivation; the faces live in CardFrontFace.tsx /
 * CardBackFace.tsx (with Crest, CardActionBar, CardOnchainSignals
 * as their siblings). Public export + props are unchanged.
 *
 * @see validator-card-prototype.html for the source visual language.
 */

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { CardBackFace } from "@/components/cards/CardBackFace";
import { CardFrontFace } from "@/components/cards/CardFrontFace";
import type { Card, CardKind } from "@/lib/api/types";

/**
 * Per-kind card chrome color. Drives the `--bcc-chain-color` CSS var
 * on the card root, which the ChainBand + Portrait gradient both
 * consume. So every validator card reads as the same hue regardless
 * of tier; every project as another; every creator as a third. Tier
 * info still surfaces on the bottom TierStrip — kind is the headline,
 * tier is the secondary qualifier.
 *
 * Member cards intentionally inherit the original crest-driven color
 * — a "member" card represents a person, not a category, so a single
 * member-wide color would erase the per-person identity the crest
 * carries today.
 *
 * Values are CSS variables defined in globals.css so the palette can
 * be tweaked centrally without touching this file. The choice:
 *   - validator → blueprint (deep navy — verified blockchain operator)
 *   - project   → safety    (orange — building / action)
 *   - creator   → kujira    (red — creative output / drop energy)
 */
const KIND_TO_COLOR_VAR: Partial<Record<CardKind, string>> = {
  validator: "var(--blueprint)",
  project:   "var(--safety)",
  creator:   "var(--chain-kujira)",
  community: "var(--union)",
};

export interface CardFactoryProps {
  card: Card;
  /**
   * Toggle "Keep Tabs" on the card. Disabled when
   * permissions.can_pull.allowed is false. The `can_pull` /
   * `onPull` field names are part of the §9 API contract — the user-
   * facing label is centralized in lib/copy.ts (FOLLOW_COPY).
   */
  onPull?: ((card: Card) => void) | undefined;
  /** Open the review composer. Disabled when permissions.can_review.allowed is false. */
  onReview?: ((card: Card) => void) | undefined;
  /** Override the default click-to-flip behavior on the card body. */
  onCardClick?: ((card: Card) => void) | undefined;
  /**
   * When true, the CTA renders in muted state — indicates the card is
   * already in the viewer's watchlist OR (during onboarding) selected for
   * batch-add on completion. The action is still clickable; clicking
   * again should call `onPull` to toggle back to idle. Server
   * permissions are still respected.
   */
  isPulled?: boolean | undefined;
  /**
   * When true, the "View profile" link in the action bar is hidden.
   * Used on the profile page itself — the link would just route to the
   * same URL, so it's dead clickbait. Other surfaces (feed cards, etc.)
   * leave it visible. */
  hideOpenAction?: boolean | undefined;
  /**
   * When true, the avatar inside the crest renders with an upload
   * overlay (hover hint "UPDATE AVATAR" + click opens file picker).
   * Only the profile owner should pass true. Default off so feed
   * cards, directory cards, etc. don't accidentally surface the
   * upload affordance. */
  canEditAvatar?: boolean | undefined;
  /**
   * Community cards only (same convention as onPull/isPulled) — fires
   * the kind-appropriate join mutation. The caller owns the dispatch
   * (holder / local / plain) because hooks can't be conditional inside
   * this polymorphic component. Ignored for non-community kinds.
   */
  onJoin?: ((card: Card) => void) | undefined;
  /**
   * Community cards only — optimistic "already joined" override for
   * the JOIN cell (plain/local paths; the NFT path never flips
   * optimistically — server truth only).
   */
  isJoined?: boolean | undefined;
  /** Community cards only — renders JOINING…/CHECKING… in the JOIN cell. */
  joinPending?: boolean | undefined;
}

export function CardFactory({
  card,
  onPull,
  onReview,
  onCardClick,
  isPulled = false,
  hideOpenAction = false,
  canEditAvatar = false,
  onJoin,
  isJoined = false,
  joinPending = false,
}: CardFactoryProps) {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Hover tilt — mouse-driven 3D rotation written to CSS custom
  // properties. Disabled under prefers-reduced-motion. The CSS uses
  // `transform: rotateX(var(--bcc-rx)) rotateY(var(--bcc-ry))`.
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || cardRef.current === null) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;  // 0 → 1
    const y = (event.clientY - rect.top) / rect.height;  // 0 → 1
    const ry = (x - 0.5) * 16; // ±8°
    const rx = (0.5 - y) * 14; // ±7°
    cardRef.current.style.setProperty("--bcc-rx", `${rx}deg`);
    cardRef.current.style.setProperty("--bcc-ry", `${ry}deg`);
  };

  const handleMouseLeave = () => {
    if (cardRef.current === null) return;
    cardRef.current.style.setProperty("--bcc-rx", "0deg");
    cardRef.current.style.setProperty("--bcc-ry", "0deg");
  };

  const handleCardClick = () => {
    if (onCardClick !== undefined) {
      onCardClick(card);
      return;
    }
    setFlipped((prev) => !prev);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardClick();
    }
  };

  // Per-kind card chrome color. Drives `--bcc-chain-color` which the
  // ChainBand + Portrait gradient both consume, so every validator
  // reads as the same color regardless of tier; tier information
  // surfaces on the TierStrip at the bottom of the card. Falls back
  // to the §2.9 crest background when the kind isn't in the map.
  //
  // Member cards inherit the original crest-driven color because
  // they don't have a single per-kind identity in the same way
  // (a "member" card is the person, not a category).
  const chainStyle = useMemo<CSSProperties>(() => {
    // Community cards with a chain-bound crest (NFT holder groups) keep
    // their chain identity — a Stargaze holders room reads as Stargaze,
    // not as generic community-green. Non-chain community crests fall
    // through to the union color in KIND_TO_COLOR_VAR.
    if (
      card.card_kind === "community" &&
      card.crest.background_kind === "chain" &&
      card.crest.background_value !== ""
    ) {
      return {
        ["--bcc-chain-color" as string]: `var(--chain-${card.crest.background_value})`,
      };
    }

    const kindColor = KIND_TO_COLOR_VAR[card.card_kind];
    if (kindColor !== undefined) {
      return { ["--bcc-chain-color" as string]: kindColor };
    }

    // Fallback: §2.9 crest background — chain | tier | solid.
    const { background_kind, background_value } = card.crest;
    if (background_value === "") return {};
    if (background_kind === "chain") {
      return { ["--bcc-chain-color" as string]: `var(--chain-${background_value})` };
    }
    if (background_kind === "tier") {
      return { ["--bcc-chain-color" as string]: `var(--tier-${background_value})` };
    }
    if (background_kind === "solid") {
      return { ["--bcc-chain-color" as string]: background_value };
    }
    return {};
  }, [card.card_kind, card.crest.background_kind, card.crest.background_value]);

  return (
    <div className="bcc-card-stage">
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${card.name} ${card.card_kind} card`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={`bcc-card ${flipped ? "is-flipped" : ""}`}
        style={chainStyle}
      >
        <CardFrontFace
          card={card}
          flipped={flipped}
          onPull={onPull}
          onReview={onReview}
          isPulled={isPulled}
          hideOpenAction={hideOpenAction}
          canEditAvatar={canEditAvatar}
          onJoin={onJoin}
          isJoined={isJoined}
          joinPending={joinPending}
        />
        <CardBackFace card={card} />
      </div>
    </div>
  );
}
