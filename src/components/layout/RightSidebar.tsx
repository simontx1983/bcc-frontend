"use client";

/**
 * RightSidebar — persistent right column.
 *
 * Contains:
 *   - Trending hashtags widget
 *   - Suggested members widget
 *   - Ads slot
 *
 * Both data widgets are wired to live endpoints (Trending →
 * useTrendingHashtags, Suggested → useSuggestedMembers). A
 * server-backed "Top Directories" widget can be added here once an
 * endpoint that returns named groupings with operator counts exists.
 */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Avatar } from "@/components/identity/Avatar";
import { RankChip } from "@/components/profile/RankChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTrendingHashtags } from "@/hooks/useTrendingHashtags";
import { useSuggestedMembers } from "@/hooks/useSuggestedMembers";
import { useWatching } from "@/hooks/useWatching";
import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import type { SuggestedMember, WatchingFollowSource } from "@/lib/api/types";

// ── Component ─────────────────────────────────────────────────────────────────

export function RightSidebar() {
  return (
    <div className="bcc-sidebar-inner">

      {/* ── Trending hashtags ── */}
      <TrendingWidget />

      {/* ── Suggested members ── */}
      <SuggestedWidget />

      {/* ── Ad slot ── */}
      <div
        className="bcc-widget"
        style={{
          minHeight: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="bcc-mono bcc-text-muted" style={{ fontSize: 11 }}>
          AD SLOT
        </span>
      </div>

    </div>
  );
}

// ── Trending hashtags widget ────────────────────────────────────────────────
//
// Wired to GET /bcc/v1/hashtags/trending via useTrendingHashtags. Rows
// render in server order (no client-side ranking). On loading: two
// muted skeleton chips (reduced-motion safe via SKELETON_CLASS). On
// error or empty result: render nothing — the widget hides gracefully
// rather than showing an empty frame or a placeholder count.

function TrendingWidget() {
  const { data, isLoading, isError } = useTrendingHashtags();
  const tags = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="bcc-widget">
        <div className="bcc-widget-head">Trending</div>
        <div className="bcc-hashtag-cloud">
          <Skeleton className="h-6 w-20" count={4} />
        </div>
      </div>
    );
  }

  if (isError || tags.length === 0) {
    return null;
  }

  return (
    <div className="bcc-widget">
      <div className="bcc-widget-head">Trending</div>
      <div className="bcc-hashtag-cloud">
        {tags.map(({ tag, count }) => (
          <Link
            key={tag}
            href={`/t/${encodeURIComponent(tag)}`}
            className="bcc-hashtag"
            title={`${count} posts`}
          >
            #{tag}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Suggested members widget ────────────────────────────────────────────────
//
// Wired to GET /bcc/v1/suggestions/users via useSuggestedMembers. The
// endpoint is personalized and AUTH-REQUIRED (401 for anon), so the
// widget reads the viewer's session and:
//   - signed-out  → renders nothing (anon sees no Suggested widget) and
//                   never fires the query (enabled gated on auth);
//   - loading     → bcc-widget shell + 3 reduced-motion-safe skeleton rows;
//   - error/empty → renders nothing (hides gracefully, like TrendingWidget).
//
// Rows render in server order (no client-side ranking). The Follow
// button reuses CardGrid's exact watch/unwatch wiring — useWatching
// builds the follow-state map, useWatchMutation / useUnwatchMutation
// toggle it. A member's watch target is the "member" CardKind keyed by
// the member id (Card.id is the user id for member cards).

interface SuggestedFollowEntry {
  follow_id: number;
  source: WatchingFollowSource;
}

function SuggestedWidget() {
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const { data, isLoading, isError } = useSuggestedMembers({ enabled: isAuthed });

  // Same watch/unwatch wiring as CardGrid: one watchlist read + the two
  // granular mutations, with a "{kind}-{id}" → {follow_id, source} map.
  const watchingQuery = useWatching({ page_size: 50 });
  const watchMutation = useWatchMutation();
  const unwatchMutation = useUnwatchMutation();

  const followMap = useMemo(() => {
    const map = new Map<string, SuggestedFollowEntry>();
    for (const item of watchingQuery.data?.items ?? []) {
      const idKey = item.page_id !== null ? item.page_id : item.card_id;
      map.set(`${item.card_kind}-${idKey}`, {
        follow_id: item.follow_id,
        source: item.follow_source ?? "peepso",
      });
    }
    return map;
  }, [watchingQuery.data]);

  const handleToggle = useCallback(
    (member: SuggestedMember): void => {
      const entry = followMap.get(`member-${member.id}`);
      if (entry !== undefined) {
        unwatchMutation.mutate({ follow_id: entry.follow_id, source: entry.source });
      } else {
        watchMutation.mutate({ target_kind: "member", target_id: member.id });
      }
    },
    [followMap, watchMutation, unwatchMutation],
  );

  // Anonymous viewers never see this widget — and the personalized query
  // was never fired for them.
  if (!isAuthed) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="bcc-widget">
        <div className="bcc-widget-head">Suggested</div>
        <div className="bcc-widget-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton className="h-9" count={3} />
        </div>
      </div>
    );
  }

  const members = data?.items ?? [];
  if (isError || members.length === 0) {
    return null;
  }

  // The mutation is fire-and-forget per click; disabling all rows while
  // either verb is in flight mirrors CardGrid's single-pending posture
  // and avoids a double-toggle race against the watchlist invalidation.
  const isMutating = watchMutation.isPending || unwatchMutation.isPending;

  return (
    <div className="bcc-widget">
      <div className="bcc-widget-head">Suggested</div>
      <div className="bcc-widget-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((member) => {
          const isFollowing = followMap.has(`member-${member.id}`);
          return (
            <div
              key={member.id}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <Link
                href={`/u/${member.handle}`}
                style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flex: 1, minWidth: 0 }}
              >
                <Avatar
                  avatarUrl={member.avatar_url}
                  handle={member.handle}
                  displayName={member.display_name}
                  size="sm"
                  variant="rounded"
                  tier={member.card_tier}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="bcc-truncate" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--bcc-text)" }}>
                    {member.display_name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <RankChip
                      cardTier={member.card_tier}
                      tierLabel={member.tier_label}
                      rankLabel={member.rank_label}
                      size="compact"
                    />
                  </span>
                  {member.suggestion_reason !== null && (
                    <span className="bcc-mono bcc-text-muted" style={{ display: "block", fontSize: 11, marginTop: 2 }}>
                      {member.suggestion_reason.label}
                    </span>
                  )}
                </span>
              </Link>
              <button
                type="button"
                className="bcc-btn bcc-btn-sm bcc-btn-ghost"
                style={{ flexShrink: 0, fontSize: 12, padding: "3px 10px" }}
                disabled={isMutating}
                aria-pressed={isFollowing}
                onClick={() => handleToggle(member)}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
