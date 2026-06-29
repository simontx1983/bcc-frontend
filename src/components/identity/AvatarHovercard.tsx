"use client";

/**
 * AvatarHovercard — wraps `Avatar` with a desktop-only hover popover
 * (display name + handle, tier dot/rank, Vouch) so the byline itself
 * can drop the always-visible `AuthorVouchButton` and read cleaner.
 *
 * Hover-only by design: touch devices have no hover, so the wrapper
 * only arms the open/close timers when `(hover: hover)` matches —
 * elsewhere the wrapped `Avatar` just behaves like it always did
 * (`asLink` tap-to-profile, no popover).
 *
 * Presentational only — every field is pre-resolved by the caller
 * (`AuthorBadge`), same §A2 boundary as `AuthorVouchButton`.
 */

import { useEffect, useRef, useState } from "react";

import { Avatar, type AvatarSize } from "@/components/identity/Avatar";
import { AuthorVouchButton } from "@/components/identity/AuthorVouchButton";
import { RankChip } from "@/components/profile/RankChip";
import type {
  AuthorVouchPermission,
  CardTier,
  ViewerAttestation,
} from "@/lib/api/types";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 150;

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
  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const canHover = () =>
    typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

  const handleEnter = () => {
    if (!canHover()) return;
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  const handleLeave = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => clearTimers, []);

  const nameText =
    typeof displayName === "string" && displayName !== "" ? displayName : `@${handle}`;

  return (
    <span
      className="relative inline-block shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
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
      {open && (
        <div
          role="dialog"
          aria-label={`${nameText} preview`}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          className="bcc-panel absolute left-0 top-full z-[120] mt-2 flex w-60 flex-col gap-2 p-3 text-left shadow-lg"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="bcc-stencil truncate text-[var(--bcc-text)]">{nameText}</span>
            <span className="bcc-mono truncate text-[11px] text-[var(--bcc-text-secondary)]">
              @{handle}
            </span>
          </div>
          {rankLabel !== "" && (
            <RankChip cardTier={cardTier} tierLabel={tierLabel} rankLabel={rankLabel} size="compact" />
          )}
          {vouchTargetId > 0 && (
            <AuthorVouchButton
              targetUserId={vouchTargetId}
              displayName={nameText}
              viewerAttestation={viewerAttestation}
              canVouch={canVouch}
            />
          )}
        </div>
      )}
    </span>
  );
}
