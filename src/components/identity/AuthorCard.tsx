"use client";

/**
 * AuthorCard — the shared, Twitter-style identity card. One component,
 * two homes: the desktop avatar hover popover (`AvatarHovercard`) and the
 * post detail right sidebar. Built to the reference: prominent avatar +
 * Follow, display name, @handle, a one-line identity chip, bio, and a
 * followers/following counts row.
 *
 * Data strategy mirrors Twitter's: render immediately from the base
 * identity fields the caller already holds (name/handle/avatar/rank —
 * §A2 server-resolved), then enrich bio + counts from a lazy `useUser`
 * fetch gated by `enabled`, showing a skeleton for just those rows so the
 * card never blocks on the network.
 */

import { Avatar } from "@/components/identity/Avatar";
import { AuthorVouchButton } from "@/components/identity/AuthorVouchButton";
import { MemberFollowButton } from "@/components/identity/MemberFollowButton";
import { RankChip } from "@/components/profile/RankChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUser } from "@/hooks/useUser";
import type {
  AuthorVouchPermission,
  CardTier,
  ViewerAttestation,
} from "@/lib/api/types";

export interface AuthorCardProps {
  handle: string;
  displayName?: string | undefined;
  avatarUrl?: string | null | undefined;
  cardTier: CardTier;
  tierLabel: string | null;
  rankLabel: string;
  isOperator?: boolean | undefined;
  /** Member user id — Follow target + Vouch target. */
  userId: number;
  viewerAttestation?: ViewerAttestation | undefined;
  canVouch?: AuthorVouchPermission | undefined;
  /**
   * Gate the bio/counts enrichment fetch. The hover popover passes its
   * open state so nothing fires until a card actually shows; the sidebar
   * passes true. Defaults to true.
   */
  enabled?: boolean;
  /** Forwarded to RankChip — see its own doc comment. */
  onOpenRankInfo?: () => void;
}

export function AuthorCard({
  handle,
  displayName,
  avatarUrl,
  cardTier,
  tierLabel,
  rankLabel,
  isOperator,
  userId,
  viewerAttestation,
  canVouch,
  enabled = true,
  onOpenRankInfo,
}: AuthorCardProps) {
  const { data: profile, isLoading } = useUser(handle, { enabled });
  const loadingProfile = isLoading && profile === undefined;

  // Prefer the caller's pre-resolved fields (feed byline has them); fall
  // back to the fetched profile so a card opened from a bare @mention
  // (handle + id only) still renders the avatar, name, and rank once the
  // profile lands.
  const effectiveAvatar =
    avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== ""
      ? avatarUrl
      : profile?.avatar_url;
  const nameText =
    typeof displayName === "string" && displayName !== ""
      ? displayName
      : profile?.display_name !== undefined && profile.display_name !== ""
        ? profile.display_name
        : `@${handle}`;
  const effectiveCardTier: CardTier = cardTier ?? profile?.card_tier ?? null;
  const effectiveTierLabel = tierLabel ?? profile?.tier_label ?? null;
  const effectiveRankLabel = rankLabel !== "" ? rankLabel : profile?.rank_label ?? "";
  const effectiveIsOperator = isOperator === true;

  const bio = profile?.bio ?? "";
  const isSelf = profile?.is_self ?? false;
  const coverUrl = profile?.cover_photo_url ?? null;
  const coverPos = profile?.cover_photo_position ?? { x: 50, y: 50 };

  return (
    <div className="flex w-full flex-col text-left">
      {/* Cover band — image when set, else a distinct filled band so the
          card always has a visible header zone. Divider separates it from
          the identity below. */}
      <div
        className="h-16 w-full border-b border-[var(--bcc-border)] bg-[var(--bcc-surface-active)] bg-cover"
        style={
          coverUrl !== null
            ? { backgroundImage: `url(${coverUrl})`, backgroundPosition: `${coverPos.x}% ${coverPos.y}%` }
            : undefined
        }
        aria-hidden
      />

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {/* Avatar straddles the cover/content divider (Twitter-style), with
            a card-colored ring punching it out of the cover. */}
        <span
          className="-mt-8 inline-flex w-fit rounded-full"
          style={{ boxShadow: "0 0 0 4px var(--bcc-glass-bg-solid)" }}
        >
          <Avatar
            avatarUrl={effectiveAvatar}
            handle={handle}
            displayName={nameText}
            size="lg"
            variant="rounded"
            tier={effectiveCardTier === null ? undefined : effectiveCardTier}
            isOperator={effectiveIsOperator}
            asLink
            ringColor="var(--bcc-accent)"
          />
        </span>

        {/* Name + handle — tight; rank pill directly under. */}
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="bcc-stencil truncate text-[15px] leading-tight text-[var(--bcc-text)]">
              {nameText}
            </span>
            {effectiveIsOperator && <OperatorMark />}
          </div>
          <span className="bcc-mono truncate text-[12px] leading-tight text-[var(--bcc-text-secondary)]">
            @{handle}
          </span>
          {effectiveRankLabel !== "" && (
            <span className="mt-1.5">
              <RankChip
                cardTier={effectiveCardTier}
                tierLabel={effectiveTierLabel}
                rankLabel={effectiveRankLabel}
                size="compact"
                handle={handle}
                {...(onOpenRankInfo !== undefined ? { onOpenRankInfo } : {})}
              />
            </span>
          )}
        </div>

        {/* Bio — enriched; skeleton while loading, crypto-flavored
            placeholder when the author hasn't written one. */}
        {loadingProfile ? (
          // Thin bars inside text-line-height boxes: reads as light body
          // text (not heavy blocks) AND reserves ~2 real bio lines so the
          // card doesn't shrink-shift when the bio lands.
          <div className="flex flex-col gap-0.5">
            <span className="flex h-[18px] items-center">
              <Skeleton className="h-2 w-full" />
            </span>
            <span className="flex h-[18px] items-center">
              <Skeleton className="h-2 w-3/4" />
            </span>
          </div>
        ) : bio !== "" ? (
          <p className="line-clamp-3 font-serif text-[13px] leading-snug text-[var(--bcc-text)]">
            {bio}
          </p>
        ) : (
          <p className="font-serif text-[13px] italic leading-snug text-[var(--bcc-text-muted)]">
            {emptyBioLine(handle)}
          </p>
        )}

        {/* Counts — always shown; both default to 0 on the view-model. */}
        {loadingProfile ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          profile !== undefined && (
            <div className="flex items-center gap-4 text-[13px]">
              <Count value={profile.counts.following} label="Watching" />
              <Count value={profile.counts.followers} label="Watchers" />
            </div>
          )
        )}

        {/* Action row — Follow + Vouch, side by side as equal 50/50 pills
            (each flex-1; a self-hidden control lets the other take the full
            width). */}
        {userId > 0 && (
          <div className="flex items-stretch gap-2 pt-0.5">
            {!isSelf && <MemberFollowButton userId={userId} className="flex-1" />}
            <AuthorVouchButton
              targetUserId={userId}
              displayName={nameText}
              viewerAttestation={viewerAttestation}
              canVouch={canVouch}
              size="card"
              className="flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A light, crypto/blue-collar-flavored stand-in for an empty bio — so the
 * card never shows a blank gap. Picked deterministically from the handle
 * so it stays stable across re-renders of the same author's card.
 */
function emptyBioLine(handle: string): string {
  const lines = [
    "No bio yet — too busy stacking sats.",
    "No bio yet — actions on-chain, words off.",
    "No bio yet — still mining for the right words.",
    "No bio yet — trust the work, not the tagline.",
    "No bio yet — clocked in, heads down.",
  ];
  let sum = 0;
  for (let i = 0; i < handle.length; i += 1) sum += handle.charCodeAt(i);
  return lines[sum % lines.length] as string;
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-[var(--bcc-text-secondary)]">
      <span className="font-semibold text-[var(--bcc-text)]">{formatCompact(value)}</span> {label}
    </span>
  );
}

function OperatorMark() {
  return (
    <span
      title="Operator"
      aria-label="Operator"
      className="inline-flex shrink-0 items-center text-[var(--bcc-accent)]"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.6 1.9 3.2-.1 1 3 2.6 1.8-1 3 1 3-2.6 1.8-1 3-3.2-.1L12 22l-2.6-1.9-3.2.1-1-3L2.6 15.4l1-3-1-3 2.6-1.8 1-3 3.2.1L12 2z" />
        <path d="M10.6 14.6l-2-2-1.1 1.1 3.1 3.1 5.3-5.3-1.1-1.1-4.2 4.2z" fill="var(--bcc-surface)" />
      </svg>
    </span>
  );
}

/** 1234 → "1.2K", 8600 → "8.6K", 2_700_000 → "2.7M". Presentational only. */
function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  const m = n / 1_000_000;
  return `${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
}
