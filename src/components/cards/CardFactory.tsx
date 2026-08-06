"use client";

/**
 * CardFactory — polymorphic trading-card component (§N2).
 *
 * Renders any §L5 Card view-model regardless of `card_kind`. The
 * server returns presentation-ready fields (`reputation_tier`,
 * `reputation_tier_label`, `crest`, `stats`, `permissions`, `social_proof`);
 * this component does ZERO derivation.
 *
 * Architectural rule (§A2): if a layout decision feels like it
 * needs to look at `trust_score` or `reputation_tier` directly,
 * it doesn't — read `reputation_tier` (the server already mapped it)
 * or `stats[]` (already formatted strings).
 *
 * What this component owns (presentation only):
 *   - Flip state, driven by the standing strip's flip chip
 *   - Hover-driven tilt, gated on prefers-reduced-motion (opaque only)
 *   - The per-kind frame colour handed down as `--card-kind`
 *   - Surface selection: opaque + real rotation, or glass + cross-fade
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
 * Per-kind frame colour. Drives `--card-kind` on the card root, which
 * the face's 3px top rule and its 58px wash both consume, and which is
 * passed down as the standing strip's identity dot.
 *
 * EVERY kind is in this map, `member` included. It previously wasn't,
 * so member cards fell through to the crest's tier colour — which is
 * why every member card rendered green.
 *
 * The colour is now always the KIND, never the chain. A Cosmos-backed
 * validator and an Osmosis-backed one are both validators first; chain
 * is a qualifier and it lives in the header pill.
 */
const KIND_TO_COLOR_VAR: Record<CardKind, string> = {
  member:    "var(--kind-member)",
  validator: "var(--kind-validator)",
  project:   "var(--kind-project)",
  creator:   "var(--kind-creator)",
  community: "var(--kind-community)",
};

export interface CardFactoryProps {
  card: Card;
  /**
   * Toggle "Keep Tabs" on the card. Disabled when
   * permissions.can_watch.allowed is false. The `can_watch` /
   * `onPull` field names are part of the §9 API contract — the user-
   * facing label is centralized in lib/copy.ts (FOLLOW_COPY).
   */
  onPull?: ((card: Card) => void) | undefined;
  /**
   * When true, the CTA renders in muted state — indicates the card is
   * already in the viewer's watchlist OR (during onboarding) selected for
   * batch-add on completion. The action is still clickable; clicking
   * again should call `onPull` to toggle back to idle. Server
   * permissions are still respected.
   */
  isPulled?: boolean | undefined;
  /**
   * Surface treatment. "opaque" (default) really rotates in 3D — used
   * by the profile hero and the directory grids. "glass" cross-fades
   * between the faces instead, because `backdrop-filter` flattens a 3D
   * transform context and the two cannot coexist; the avatar hovercard
   * is the only host where glass buys anything (it's the only one with
   * content behind the card to refract) and also the only one where
   * rotation isn't wanted.
   */
  surface?: "opaque" | "glass";
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
  /**
   * When true, the front face's full-bleed navigation overlay to
   * `card.links.self` is omitted. Pass on surfaces where that link is
   * wrong: the profile/group hero (it would loop back to the page the
   * viewer is already on — the pre-redesign `hideOpenAction` contract)
   * and the onboarding wizard (a body mis-click would exit the flow
   * mid-wizard). Flip and action cells are unaffected.
   */
  suppressBodyLink?: boolean | undefined;
}

export function CardFactory({
  card,
  onPull,
  isPulled = false,
  surface = "opaque",
  canEditAvatar = false,
  onJoin,
  isJoined = false,
  joinPending = false,
  suppressBodyLink = false,
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

  const handleFlip = () => setFlipped((prev) => !prev);

  const kindColor = KIND_TO_COLOR_VAR[card.card_kind];
  const kindStyle = useMemo<CSSProperties>(
    () => ({ ["--card-kind" as string]: kindColor }),
    [kindColor],
  );

  const isGlass = surface === "glass";

  return (
    <div className="bcc-card-stage">
      {/*
        The root is a plain container now, not a role="button". Two live
        bugs die with that change: the flip chip had never actually been
        a button (an aria-hidden <span> with no handler, its own comment
        calling it "decorative"), and clicking the card body didn't flip
        either. The body is a link and the chip is a real <button>, so
        neither behaviour has anywhere left to live.
      */}
      <div
        ref={cardRef}
        onMouseMove={isGlass ? undefined : handleMouseMove}
        onMouseLeave={isGlass ? undefined : handleMouseLeave}
        className={`bcc-card${flipped ? " is-flipped" : ""}${isGlass ? " is-flat" : ""}`}
        style={kindStyle}
      >
        <CardFrontFace
          card={card}
          kindColor={kindColor}
          flipped={flipped}
          onFlip={handleFlip}
          onPull={onPull}
          isPulled={isPulled}
          canEditAvatar={canEditAvatar}
          onJoin={onJoin}
          isJoined={isJoined}
          joinPending={joinPending}
          suppressBodyLink={suppressBodyLink}
        />
        <CardBackFace
          card={card}
          kindColor={kindColor}
          flipped={flipped}
          onFlip={handleFlip}
        />
      </div>
    </div>
  );
}
