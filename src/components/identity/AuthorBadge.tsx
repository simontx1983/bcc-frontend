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
import { RankChip } from "@/components/profile/RankChip";
import type { CardTier } from "@/lib/api/types";

export interface AuthorBadgeAuthor {
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
}

export interface AuthorBadgeProps {
  author: AuthorBadgeAuthor;
  /** Right-side slot (timestamp, kind label, etc.). */
  trailing?: React.ReactNode;
  /** Pills/badges rendered to the right of the display name. */
  inlineAdornments?: React.ReactNode;
  /** sm (default) = 28px avatar; md = 40px avatar (composer, prominent rows). */
  size?: "sm" | "md" | undefined;
  /** Whether the avatar + display name link to /u/{handle}. */
  asLink?: boolean | undefined;
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
  asLink = true,
  className,
}: AuthorBadgeProps) {
  const avatarSize = AVATAR_SIZE_BY_BADGE[size];
  const nameText =
    typeof author.display_name === "string" && author.display_name !== ""
      ? author.display_name
      : `@${author.handle}`;

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
          background: "rgba(44,157,102,0.10)",
          border:     "1px solid rgba(44,157,102,0.40)",
        }}
        title="Verified operator/creator on at least one entity."
      >
        OPERATOR
      </span>
    ) : null;

  const nameNode = asLink ? (
    <Link
      href={`/u/${author.handle}` as Route}
      className="bcc-stencil truncate text-ink hover:underline"
    >
      {nameText}
    </Link>
  ) : (
    <span className="bcc-stencil truncate text-ink">{nameText}</span>
  );

  return (
    <div
      className={`flex w-full items-start justify-between gap-3 ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Avatar
          avatarUrl={author.avatar_url}
          handle={author.handle}
          displayName={author.display_name}
          size={avatarSize}
          variant="rounded"
          tier={cardTier === null ? undefined : cardTier}
          isOperator={author.is_operator === true}
          asLink={asLink}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            {nameNode}
            {operatorPill}
            {inlineAdornments}
          </div>
          {rankLabel !== "" && (
            <RankChip
              cardTier={cardTier}
              tierLabel={tierLabel}
              rankLabel={rankLabel}
              size="compact"
            />
          )}
        </div>
      </div>
      {trailing !== undefined && trailing !== null && (
        <div className="flex shrink-0 items-baseline">{trailing}</div>
      )}
    </div>
  );
}

export const AuthorBadge = memo(AuthorBadgeImpl);
AuthorBadge.displayName = "AuthorBadge";
