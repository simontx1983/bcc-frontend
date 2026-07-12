"use client";

/**
 * AuthorBadge — composite author header (Sprint 1 Identity Grammar).
 *
 * Composes <Avatar /> + display-name + optional <RankChip />, with
 * slots for inline adornments (kind label, verification badge) and a
 * trailing element (timestamp). Used at feed, comment, and
 * notification surfaces so identity reads continuously across them.
 *
 * Critical §A2 boundaries (Phillip — these are why this component
 * does NOT compute a tier locally):
 *
 *   1. `RankChip` accepts `cardTier: CardTier` and `tierLabel: string |
 *      null` — both server-resolved on the view-model. The frontend
 *      MUST NOT manufacture a reputation_tier → card_tier mapping;
 *      that's §A2/§J.6 server-owned business logic.
 *
 *   2. `FeedAuthor` and `CommentAuthor` currently ship `rank_label`
 *      and `reputation_tier`, but NOT `card_tier` or `tier_label`.
 *      Until the backend extends those view-models, AuthorBadge
 *      renders the chip with `cardTier={null}` (neutral cardstock
 *      rail) and an empty `tierLabel` — the rank word still ships,
 *      just without the tier color accent.
 *
 *   3. When the BE extends those view-models, the consumer at
 *      FeedItemCard/CommentDrawer/NotificationRow can start passing
 *      `card_tier` + `tier_label` to AuthorBadge as an optional
 *      override and the chip will tint correctly. Until then the
 *      austere neutral chip is the correct compromise — no false
 *      tier signal, no §A2 violation.
 *
 * Memoized at the export boundary. Stable `author` references skip
 * re-renders in dense lists (notification dropdown, comment thread).
 */

import { memo } from "react";
import Link from "next/link";
import type { Route } from "next";

import { Avatar, type AvatarSize } from "@/components/identity/Avatar";
import { AuthorHoverPanel } from "@/components/identity/AuthorHoverPanel";
import { RankChip } from "@/components/profile/RankChip";
import { useHovercard } from "@/hooks/useHovercard";
import { usePrefetchUser } from "@/hooks/useUser";
import type {
  AuthorVouchPermission,
  CardTier,
  ViewerAttestation,
} from "@/lib/api/types";

export interface AuthorBadgeAuthor {
  /**
   * Author user id — present on feed/comment author blocks (the v1.5
   * polymorphic shape ships `id`; `user_id` is the legacy alias). Target
   * of the byline Vouch toggle.
   */
  id?: number | undefined;
  /** Legacy alias for {@link AuthorBadgeAuthor.id}; preferred is `id`. */
  user_id?: number | undefined;
  handle: string;
  display_name?: string | undefined;
  avatar_url?: string | undefined;
  rank_label?: string | null | undefined;
  /**
   * Server-resolved card-tier slug. When present we tint the RankChip
   * rail; when absent (or null = risky-tier) the rail falls back to
   * neutral cardstock. Most view-models that ship rank_label also ship
   * this; FeedAuthor/CommentAuthor currently don't.
   */
  card_tier?: CardTier | undefined;
  /** Pre-rendered tier word ("Uncommon", "Rare", etc.). Server-owned. */
  tier_label?: string | null | undefined;
  is_operator?: boolean | undefined;
  /**
   * Authed-only — the viewer's vouch state on this author, behind the
   * byline Vouch toggle. Absent (anon / surfaces that don't ship it) →
   * the toggle simply doesn't render.
   */
  viewer_attestation?: ViewerAttestation | undefined;
  /** Authed-only — whether the viewer may vouch for this author. */
  can_vouch?: AuthorVouchPermission | undefined;
}

export interface AuthorBadgeProps {
  author: AuthorBadgeAuthor;
  /** Right-side slot (timestamp, kind label, etc.). */
  trailing?: React.ReactNode;
  /** Pills/badges rendered to the right of the display name. */
  inlineAdornments?: React.ReactNode;
  /** sm (default) = 28px avatar; md = 36px avatar (composer, prominent rows). */
  size?: "sm" | "md" | undefined;
  /**
   * Override the avatar's ring color (e.g. "var(--bcc-accent)"), taking
   * precedence over the tier-derived ring. Forwarded straight to
   * `<Avatar ringColor>` — see its doc comment for the rationale.
   */
  avatarRingColor?: string | undefined;
  /** Whether the avatar + display name link to /u/{handle}. */
  asLink?: boolean | undefined;
  /**
   * Show the avatar hover card on desktop. Default true. Turn off where a
   * fuller card is already visible right beside the badge (e.g. the
   * "more from author" mini post, which sits under the author card).
   */
  hovercard?: boolean | undefined;
  /** Render the RankChip beside the name/handle. Default true. */
  showRank?: boolean | undefined;
  className?: string | undefined;
}

const AVATAR_SIZE_BY_BADGE: Record<"sm" | "md", AvatarSize> = {
  sm: "sm",
  md: "md",
};

function AuthorBadgeImpl({
  author,
  trailing,
  inlineAdornments,
  size = "sm",
  avatarRingColor,
  asLink = true,
  hovercard = true,
  showRank = true,
  className,
}: AuthorBadgeProps) {
  const avatarSize = AVATAR_SIZE_BY_BADGE[size];
  const hover = useHovercard();
  const prefetchUser = usePrefetchUser();
  const hasDisplayName =
    typeof author.display_name === "string" && author.display_name !== "";
  const nameText = hasDisplayName ? (author.display_name as string) : `@${author.handle}`;

  // RankChip self-hides on empty rankLabel — see RankChip.tsx:77. We
  // also short-circuit here so the wrapping <div> doesn't reserve space
  // for an invisible chip and shift the header layout.
  const rankLabel =
    typeof author.rank_label === "string" && author.rank_label !== ""
      ? author.rank_label
      : "";
  const cardTier: CardTier =
    author.card_tier === undefined ? null : author.card_tier;
  const tierLabel: string | null =
    typeof author.tier_label === "string" && author.tier_label !== ""
      ? author.tier_label
      : null;

  // Vouch toggle target — prefer the v1.5 `id`, fall back to the legacy
  // `user_id`. AuthorVouchButton self-hides when the author block carries
  // no can_vouch/viewer_attestation (anon, or surfaces that don't ship it).
  const vouchTargetId =
    typeof author.id === "number" && author.id > 0
      ? author.id
      : typeof author.user_id === "number" && author.user_id > 0
        ? author.user_id
        : 0;

  // Operator pill is intentionally folded into AuthorBadge per Sprint 1
  // brief — it used to render inline on FeedItemCard; consolidating
  // here makes operator presence travel with identity to every surface
  // that adopts AuthorBadge (comments, notifications, etc.).
  const operatorPill =
    author.is_operator === true ? (
      <span
        className="bcc-mono shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-[0.18em]"
        style={{
          color:      "var(--verified)",
          background: "rgb(var(--verified-rgb) / 0.10)",
          border:     "1px solid rgb(var(--verified-rgb) / 0.40)",
        }}
        title="Verified operator/creator on at least one entity."
      >
        OPERATOR
      </span>
    ) : null;

  const nameNode = asLink ? (
    <Link
      href={`/u/${author.handle}` as Route}
      className="bcc-stencil truncate text-[var(--bcc-text)] hover:underline"
    >
      {nameText}
    </Link>
  ) : (
    <span className="bcc-stencil truncate text-[var(--bcc-text)]">{nameText}</span>
  );

  const avatarNode = (
    <Avatar
      avatarUrl={author.avatar_url}
      handle={author.handle}
      displayName={author.display_name}
      size={avatarSize}
      variant="rounded"
      tier={cardTier === null ? undefined : cardTier}
      isOperator={author.is_operator === true}
      ringColor={avatarRingColor}
      asLink={asLink}
    />
  );

  // Identity Grammar v2 — avatar + a name/@handle stack, the two aligned
  // on a shared center so the stack reads as vertically centered against
  // the avatar (the avatar edging it very slightly taller). This pair is
  // the ONE hover trigger: hovering the avatar OR the name text opens the
  // card (B6). The RankChip sits OUTSIDE this pair so hovering it never
  // opens the author card (it gets its own affordance) and the hover hit
  // area stays tight to the identity, not the whole byline width (#2/#6).
  const identityCore = (
    <>
      {avatarNode}
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-1.5">
          {nameNode}
          {operatorPill}
          {inlineAdornments}
        </div>
        {hasDisplayName && (
          <span className="bcc-mono truncate text-[11px] leading-tight text-[var(--bcc-text-secondary)]">
            @{author.handle}
          </span>
        )}
      </div>
    </>
  );

  const rank =
    showRank && rankLabel !== "" ? (
      <RankChip
        cardTier={cardTier}
        tierLabel={tierLabel}
        rankLabel={rankLabel}
        size="compact"
        className="shrink-0"
        handle={author.handle}
      />
    ) : null;

  // Warm the profile cache the instant the pointer lands on the identity,
  // before the hover open delay elapses.
  const onEnter = () => {
    prefetchUser(author.handle);
    hover.triggerHandlers.onMouseEnter();
  };

  return (
    <div
      className={`flex w-full items-start justify-between gap-3 ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {hovercard ? (
          <span
            ref={hover.triggerRef}
            className="flex min-w-0 items-center gap-2.5"
            onMouseEnter={onEnter}
            onMouseLeave={hover.triggerHandlers.onMouseLeave}
          >
            {identityCore}
            {hover.open && hover.coords !== null && (
              <AuthorHoverPanel
                coords={hover.coords}
                handlers={hover.popoverHandlers}
                label={`${nameText} preview`}
                handle={author.handle}
                displayName={author.display_name}
                avatarUrl={author.avatar_url}
                cardTier={cardTier}
                tierLabel={tierLabel}
                rankLabel={rankLabel}
                isOperator={author.is_operator === true}
                userId={vouchTargetId}
                viewerAttestation={author.viewer_attestation}
                canVouch={author.can_vouch}
                enabled={hover.open}
              />
            )}
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2.5">{identityCore}</span>
        )}
        {rank}
      </div>
      {trailing !== undefined && trailing !== null && (
        <div className="flex shrink-0 items-baseline">{trailing}</div>
      )}
    </div>
  );
}

export const AuthorBadge = memo(AuthorBadgeImpl);
AuthorBadge.displayName = "AuthorBadge";
