"use client";

/**
 * AvatarHovercard — wraps `Avatar` with a desktop-only hover popover that
 * shows the full `AuthorCard`. The popover is PORTALED to document.body
 * and positioned with fixed coordinates from the trigger's rect, so it
 * floats above everything and can't be clipped by an ancestor's
 * `overflow: hidden` (e.g. the `.bcc-widget` sidebar cards) — the
 * previous inline-absolute version got buried inside those cards.
 *
 * Hover-only by design: touch devices have no hover, so the wrapper only
 * arms the open/close timers when `(hover: hover)` matches — elsewhere the
 * wrapped `Avatar` just behaves as before (`asLink` tap-to-profile).
 *
 * Presentational only — every field is pre-resolved by the caller.
 */

import { useState } from "react";

import { Avatar, type AvatarSize } from "@/components/identity/Avatar";
import { AuthorHoverPanel } from "@/components/identity/AuthorHoverPanel";
import { RankInfoModal } from "@/components/identity/RankInfoModal";
import { useHovercard } from "@/hooks/useHovercard";
import { usePrefetchUser } from "@/hooks/useUser";
import type {
  AuthorVouchPermission,
  CardTier,
  ViewerAttestation,
} from "@/lib/api/types";

export interface AvatarHovercardProps {
  avatarUrl: string | null | undefined;
  handle: string;
  displayName?: string | undefined;
  size: AvatarSize;
  cardTier: CardTier;
  isOperator?: boolean | undefined;
  ringColor?: string | undefined;
  /** Whether the avatar links to `/u/{handle}`. Defaults to true. */
  asLink?: boolean | undefined;
  rankLabel: string;
  tierLabel: string | null;
  vouchTargetId: number;
  viewerAttestation?: ViewerAttestation | undefined;
  canVouch?: AuthorVouchPermission | undefined;
}

export function AvatarHovercard({
  avatarUrl,
  handle,
  displayName,
  size,
  cardTier,
  isOperator,
  ringColor,
  asLink = true,
  rankLabel,
  tierLabel,
  vouchTargetId,
  viewerAttestation,
  canVouch,
}: AvatarHovercardProps) {
  const { open, coords, triggerRef, close, triggerHandlers, popoverHandlers } = useHovercard();
  const prefetchUser = usePrefetchUser();
  // Owned here, not by RankChip, specifically so it survives the
  // hovercard closing — see RankChip's onOpenRankInfo doc comment.
  const [rankModalOpen, setRankModalOpen] = useState(false);

  const nameText =
    typeof displayName === "string" && displayName !== "" ? displayName : `@${handle}`;

  // Warm the profile cache the instant the pointer lands, before the hover
  // open delay elapses — so the card usually has bio/counts ready on mount.
  const onEnter = () => {
    prefetchUser(handle);
    triggerHandlers.onMouseEnter();
  };

  return (
    <span
      ref={triggerRef}
      className="inline-block shrink-0"
      onMouseEnter={onEnter}
      onMouseLeave={triggerHandlers.onMouseLeave}
    >
      <Avatar
        avatarUrl={avatarUrl}
        handle={handle}
        displayName={displayName}
        size={size}
        variant="rounded"
        tier={cardTier === null ? undefined : cardTier}
        isOperator={isOperator}
        asLink={asLink}
        ringColor={ringColor}
      />
      {open && coords !== null && (
        <AuthorHoverPanel
          coords={coords}
          handlers={popoverHandlers}
          label={`${nameText} preview`}
          handle={handle}
          displayName={displayName}
          avatarUrl={avatarUrl}
          cardTier={cardTier}
          tierLabel={tierLabel}
          rankLabel={rankLabel}
          isOperator={isOperator}
          userId={vouchTargetId}
          viewerAttestation={viewerAttestation}
          canVouch={canVouch}
          enabled={open}
          onOpenRankInfo={() => {
            close();
            setRankModalOpen(true);
          }}
        />
      )}
      {rankModalOpen && (
        <RankInfoModal
          handle={handle}
          cardTier={cardTier}
          tierLabel={tierLabel}
          rankLabel={rankLabel}
          onClose={() => setRankModalOpen(false)}
        />
      )}
    </span>
  );
}
