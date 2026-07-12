"use client";

/**
 * PostRightRail — the right sidebar's contents on a post detail view.
 * Swapped in for the default `RightSidebar` via the RightRail slot when
 * `/post/[id]` registers its author + id. Composes:
 *   - the author card (same component as the avatar hover card)
 *   - "more from this author" (dynamic; hides when there are none)
 *   - the ad slot
 */

import { AuthorCard } from "@/components/identity/AuthorCard";
import { AdCarousel } from "@/components/layout/AdCarousel";
import { MoreFromAuthor } from "@/components/layout/MoreFromAuthor";
import type { RightRailData } from "@/components/layout/RightRailContext";

export function PostRightRail({ author, feedId }: RightRailData) {
  const userId = author.id ?? author.user_id;
  const authorName =
    typeof author.display_name === "string" && author.display_name !== ""
      ? author.display_name
      : `@${author.handle}`;

  return (
    <div className="bcc-sidebar-inner">
      {/* Author card — glass panel, matching the hover card's treatment. */}
      <div
        className="mb-3 overflow-hidden rounded-2xl shadow-sm"
        style={{
          background: "var(--bcc-glass-bg-solid)",
          backdropFilter: "blur(var(--bcc-glass-blur))",
          WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
          border: "1px solid var(--bcc-glass-border)",
        }}
      >
        <AuthorCard
          handle={author.handle}
          displayName={author.display_name}
          avatarUrl={author.avatar_url}
          cardTier={author.card_tier ?? null}
          tierLabel={author.tier_label ?? null}
          rankLabel={author.rank_label ?? ""}
          isOperator={author.is_operator}
          userId={userId}
          viewerAttestation={author.viewer_attestation}
          canVouch={author.can_vouch}
          enabled
        />
      </div>

      <MoreFromAuthor handle={author.handle} authorName={authorName} excludeFeedId={feedId} />

      <AdCarousel />
    </div>
  );
}
