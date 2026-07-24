"use client";

/**
 * GroupFeedSection — the §4.7.6 group-scoped feed surface.
 *
 * Two paths driven by `group.feed_visible` (server-authoritative gate
 * per §A2 / §S — frontend NEVER recomputes from privacy + type):
 *
 *   feed_visible = false → render <GroupGatedNotice/> (verbatim
 *                          unlock_hint), do NOT mount the feed query
 *                          (avoids hitting the wire for a known 403).
 *   feed_visible = true  → optional in-context Composer for active
 *                          members + useGroupFeed(group.id) →
 *                          existing FeedItemCard list.
 *
 * Composer mount rule (§4.7.6): only when the viewer is an active
 * member of the group (`viewer_membership.is_member === true`). The
 * composer carries `groupId={group.id}` so every submit (status /
 * photo / GIF) lands inside the group's wall and the
 * useCreatePost*Mutation hooks invalidate
 * `[GROUP_FEED_QUERY_KEY_ROOT, group.id]` so the new post surfaces
 * here without a manual refetch. The server enforces membership
 * (POST returns 403 `bcc_permission_denied` otherwise) — the FE mount
 * gate is convenience, not security.
 *
 * The rendered card list is wrapped in a `React.memo()` row component
 * so per-row re-renders don't cascade across the list when only one
 * item updates (matches the §S "memoize feed cards" rule).
 */

import { memo, useCallback } from "react";

import { Composer } from "@/components/composer/Composer";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { GroupGatedNotice } from "@/components/groups/GroupGatedNotice";
import { GroupPostPolicyToggle } from "@/components/groups/GroupPostPolicyToggle";
import { useGroupFeed } from "@/hooks/useGroupFeed";
import { humanizeCode } from "@/lib/api/errors";
import type { FeedItem, GroupDetailResponse } from "@/lib/api/types";
import { unlockHint } from "@/lib/permissions";

interface GroupFeedSectionProps {
  group: GroupDetailResponse;
}

export function GroupFeedSection({ group }: GroupFeedSectionProps) {
  if (!group.feed_visible) {
    return (
      <GroupGatedNotice
        hint={unlockHint(group.permissions, "can_read_feed")}
        variant="feed"
      />
    );
  }

  // Server-derived "viewer is an active member here right now." Drives
  // BOTH the composer mount AND the per-card write affordances. Phase 2:
  // feed_visible is now true for non-members of nft/closed groups (they
  // get a public-only filtered teaser), so feed_visible alone no longer
  // implies the viewer can interact — membership does. Anonymous
  // viewers and non-members never see the composer; the membership flip
  // is handled upstream by the join/leave mutations invalidating the
  // useGroup query, which re-renders this section with a fresh
  // viewer_membership block.
  const canInteract =
    group.viewer_membership !== null &&
    group.viewer_membership.is_member === true;

  return (
    <div className="flex flex-col gap-6">
      {/* CL-FN06 leader control — server says this viewer may manage
          the members-can-post-public policy (owner/manager/site-admin;
          `public_all_members_enabled` carries its real value exactly
          when this flag is true). Explicit === true so pre-CL-FN06
          backends (field absent) never mount a control that would 404. */}
      {group.can_manage_public_all_policy === true && (
        <GroupPostPolicyToggle
          groupId={group.id}
          enabled={group.public_all_members_enabled === true}
        />
      )}
      {canInteract && (
        <Composer
          variant="inline"
          groupId={group.id}
          groupScopeLabel={`POST IN ${group.name.toUpperCase()}`}
          canUsePublicAll={group.can_use_public_all}
        />
      )}
      {/* Non-member teaser hint (Phase 2): feed_visible is true but the
          viewer can't write here. Client-authored affordance copy — not
          a server verdict. The actual CHECK & JOIN button lives on
          GroupMembershipStrip, so we don't duplicate it; this is just a
          one-line orientation so the disabled comment/reaction controls
          below don't read as broken. */}
      {!canInteract && (
        <p className="bcc-mono text-[11px] tracking-[0.16em] text-bcc-text-secondary/70">
          You&apos;re viewing public posts. Join to comment and react.
        </p>
      )}
      <GroupFeedBody
        groupId={group.id}
        canInteract={canInteract}
        groupKind={group.type}
      />
    </div>
  );
}

function GroupFeedBody({
  groupId,
  canInteract,
  groupKind,
}: {
  groupId: number;
  canInteract: boolean;
  groupKind: GroupDetailResponse["type"];
}) {
  const query = useGroupFeed(groupId);

  const handleLoadMore = useCallback(() => {
    if (!query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  if (query.isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="bcc-mono text-cardstock-deep">Loading the floor…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="py-8">
        <p role="alert" className="bcc-mono text-safety">
          {/* §γ — copy is keyed on err.code; never render err.message. */}
          {humanizeCode(
            query.error,
            {
              bcc_unauthorized: "Sign in to read this group's feed.",
              bcc_rate_limited: "Loading too fast — give it a moment and try again.",
              bcc_unavailable: "This group's feed is temporarily unavailable. Try again shortly.",
            },
            "Couldn't load this group's feed. Try again in a moment.",
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
          className="bcc-mono mt-3 text-cardstock-deep underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);

  if (items.length === 0) {
    // Phase γ retention pass (2026-05-13): rather than the generic
    // "Quiet inside" copy, surface a founder-chair frame when the
    // viewer is a member who can post — turns the empty room from
    // "this place is dead" into "you're early, and the next move is
    // yours." For anonymous viewers / non-members the original copy
    // stands because they can't act on the prompt anyway.
    return (
      <div className="bcc-panel mx-auto p-6 text-center">
        <h2 className="bcc-stencil text-2xl text-bcc-text">
          {canInteract ? emptyHeading(groupKind) : "Quiet inside"}
        </h2>
        <p className="mt-2 font-serif text-bcc-text-secondary">
          {canInteract
            ? emptyBody(groupKind)
            : "Members will write the first chapter here."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <GroupFeedItem key={item.id} item={item} canInteract={canInteract} />
      ))}

      {query.hasNextPage && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={query.isFetchingNextPage}
          className="bcc-stencil mx-auto mt-4 border border-cardstock-edge/40 px-6 py-2.5 text-cardstock disabled:opacity-50"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}

      {!query.hasNextPage && items.length > 0 && (
        <p className="bcc-mono mt-4 text-center text-cardstock-deep/60">
          End of the feed.
        </p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Empty-feed founder-chair copy — surfaces only when the viewer is a
// member who can post. Tone matches the platform's civic register
// (no exclamation marks, no fake urgency); the goal is "you're early"
// not "engagement bait."
// ──────────────────────────────────────────────────────────────────────

function emptyHeading(kind: GroupDetailResponse["type"]): string {
  switch (kind) {
    case "local":
      return "Looking for its first shift.";
    case "nft":
      return "Empty room. Your call.";
    case "system":
    case "user":
    default:
      return "First post lands here.";
  }
}

function emptyBody(kind: GroupDetailResponse["type"]): string {
  switch (kind) {
    case "local":
      return "Nobody's posted in this Local yet. The first post sets the tone — the rest of the chain sees it when they show up.";
    case "nft":
      return "You hold the gating NFT and you're inside. So is anyone else who qualifies — but the room's quiet. First post sets the tone for the holders.";
    case "system":
    case "user":
    default:
      return "No posts here yet. You're early. The first post on the floor of this room is a permanent piece of its record.";
  }
}

// ──────────────────────────────────────────────────────────────────────
// Memoized row wrapper. `FeedItemCard` may have its own internal state
// (open comments, reaction-rail focus); wrapping with `memo` here means
// a reference-stable `item` skips the re-render. The `FeedItem` from
// React Query's cache IS reference-stable across re-renders unless the
// item actually changed, so default shallow-equality is sufficient.
// ──────────────────────────────────────────────────────────────────────

const GroupFeedItem = memo(function GroupFeedItem({
  item,
  canInteract,
}: {
  item: FeedItem;
  canInteract: boolean;
}) {
  return <FeedItemCard item={item} canInteract={canInteract} />;
});
