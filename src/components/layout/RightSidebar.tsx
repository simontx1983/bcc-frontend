"use client";

/**
 * RightSidebar — persistent right column.
 *
 * Contains:
 *   - Newest members widget
 *   - Trending hashtags widget
 *   - Suggested members widget
 *   - Ads slot
 *
 * All data widgets are wired to live endpoints (Newest → useMembers
 * default sort = recently joined, public; Trending → useTrendingHashtags;
 * Suggested → useSuggestedMembers, auth-only).
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { AdCarousel } from "@/components/layout/AdCarousel";
import { Avatar } from "@/components/identity/Avatar";
import { AvatarHovercard } from "@/components/identity/AvatarHovercard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMembers } from "@/hooks/useMembers";
import { useTrendingHashtags } from "@/hooks/useTrendingHashtags";
import { useSuggestedMembers } from "@/hooks/useSuggestedMembers";
import { useWatchMutation, useUnwatchMutation, watchErrorCopy } from "@/hooks/useWatch";
import { FOLLOW_COPY } from "@/lib/copy";
import type { SuggestedMember, WatchingFollowSource } from "@/lib/api/types";

// ── Component ─────────────────────────────────────────────────────────────────

export function RightSidebar() {
  return (
    <div className="bcc-sidebar-inner">

      {/* ── Newest members ── */}
      <NewestMembersWidget />

      {/* ── Trending hashtags ── */}
      <TrendingWidget />

      {/* ── Suggested members ── */}
      <SuggestedWidget />

      {/* ── Ad slot ── */}
      <AdCarousel />

    </div>
  );
}

// ── Newest members widget ───────────────────────────────────────────────────
//
// Wired to GET /bcc/v1/members via useMembers — the directory's default
// sort is "joined most recently", so page 1 is the newest faces on the
// Floor. Public (the members directory is anon-readable), so this widget
// shows for signed-out visitors too. Rows render in server order (no
// client ranking). loading → skeleton rows; error/empty → render nothing
// (hides gracefully, like the other widgets). Replaced the fabricated
// "Top Directories" stub.

const NEWEST_COUNT = 5;

function NewestMembersWidget() {
  const { data, isLoading, isError } = useMembers({ page: 1, perPage: NEWEST_COUNT });

  if (isLoading) {
    return (
      <div className="bcc-widget">
        <div className="bcc-widget-head">Newest Members</div>
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

  return (
    <div className="bcc-widget">
      <div className="bcc-widget-head">Newest Members</div>
      <div className="bcc-widget-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((member) => (
          <div
            key={member.id}
            style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
          >
            <AvatarHovercard
              avatarUrl={member.crest.image_url ?? ""}
              avatarFallbackUrl={member.crest.image_fallback_url}
              handle={member.handle}
              displayName={member.name}
              size="md"
              reputationTier={member.reputation_tier}
              rankLabel={member.rank_label ?? ""}
              tierLabel={member.reputation_tier_label ?? "Neutral"}
              vouchTargetId={member.id}
              ringColor="var(--bcc-accent)"
              asLink
            />
            <Link
              href={`/u/${member.handle}`}
              style={{ flex: 1, minWidth: 0, textDecoration: "none" }}
            >
              <span className="bcc-truncate" style={{ display: "block", fontSize: 13, lineHeight: 1.25, fontWeight: 600, color: "var(--bcc-text)" }}>
                {member.name}
              </span>
              <span className="bcc-mono truncate text-[11px] leading-tight text-[var(--bcc-text-secondary)]" style={{ display: "block", marginTop: 1 }}>
                @{member.handle}
              </span>
            </Link>
          </div>
        ))}
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
// Rows render in server order (no client-side ranking). The Watch button
// starts "not watching" (suggestions exclude watched members) and tracks
// this session's own toggles from the mutation responses (F-255).
// A member's watch target is the "member" CardKind keyed by the member id
// (Card.id is the user id for member cards).

interface SuggestedFollowEntry {
  follow_id: number;
  source: WatchingFollowSource;
}

function SuggestedWidget() {
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const { data, isLoading, isError } = useSuggestedMembers({ enabled: isAuthed });

  // F-255: suggestions exclude members the viewer already watches, so every
  // row starts "not watching". The outcome of this viewer's own toggles is
  // kept per member, from the mutation RESPONSE: a watch answers with the
  // follow (also when it was `already_watching`, which covers the rare
  // suggestion of someone already followed), an unwatch clears it. This
  // used to search the first page of /me/watching (50 items), which is
  // partial — there is no cap on watches.
  // Outcome per member: the follow, or null once unwatched. Absent → the
  // row's own `viewer_watch` if the server sent one (it normally excludes
  // watched members, so that is usually "not watching").
  const [outcomes, setOutcomes] = useState<ReadonlyMap<number, SuggestedFollowEntry | null>>(
    () => new Map(),
  );
  const watchOf = useCallback(
    (member: SuggestedMember): SuggestedFollowEntry | null =>
      outcomes.has(member.id)
        ? (outcomes.get(member.id) ?? null)
        : member.viewer_is_watching === true
          ? (member.viewer_watch ?? null)
          : null,
    [outcomes],
  );
  const watchMutation = useWatchMutation();
  const unwatchMutation = useUnwatchMutation();
  // F-236: inline line under the row whose toggle failed. Keyed on the
  // error code, never err.message; cleared by the next click. One at a
  // time is enough because every row is disabled while a toggle runs.
  const [failure, setFailure] = useState<{ memberId: number; text: string } | null>(null);

  const setOutcome = useCallback((memberId: number, entry: SuggestedFollowEntry | null) => {
    setOutcomes((prev) => new Map(prev).set(memberId, entry));
  }, []);

  const handleToggle = useCallback(
    (member: SuggestedMember): void => {
      const entry = watchOf(member);
      setFailure(null);
      if (entry !== null) {
        unwatchMutation.mutate(
          { follow_id: entry.follow_id, source: entry.source, target: { card_kind: "member", id: member.id } },
          {
            onSuccess: () => setOutcome(member.id, null),
            onError: (err) => setFailure({ memberId: member.id, text: watchErrorCopy(err, "unwatch") }),
          },
        );
      } else {
        watchMutation.mutate(
          { target_kind: "member", target_id: member.id },
          {
            onSuccess: (res) =>
              setOutcome(member.id, {
                follow_id: res.item.follow_id,
                source: res.item.follow_source ?? "peepso",
              }),
            onError: (err) => setFailure({ memberId: member.id, text: watchErrorCopy(err, "watch") }),
          },
        );
      }
    },
    [watchOf, watchMutation, unwatchMutation, setOutcome],
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
          const isFollowing = watchOf(member) !== null;
          return (
            <div key={member.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AvatarHovercard
                  avatarUrl={member.avatar_url}
                  handle={member.handle}
                  displayName={member.display_name}
                  size="md"
                  reputationTier={member.reputation_tier}
                  rankLabel={member.rank_label ?? ""}
                  tierLabel={member.reputation_tier_label ?? "Neutral"}
                  vouchTargetId={member.id}
                  ringColor="var(--bcc-accent)"
                  asLink
                />
                <Link
                  href={`/u/${member.handle}`}
                  style={{ textDecoration: "none", flex: 1, minWidth: 0 }}
                >
                  <span style={{ display: "block", minWidth: 0 }}>
                    <span className="bcc-truncate" style={{ display: "block", fontSize: 13, lineHeight: 1.25, fontWeight: 600, color: "var(--bcc-text)" }}>
                      {member.display_name}
                    </span>
                    <span className="bcc-mono truncate text-[11px] leading-tight text-[var(--bcc-text-secondary)]" style={{ display: "block", marginTop: 1 }}>
                      @{member.handle}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className={`bcc-btn bcc-btn-sm ${isFollowing ? "bcc-btn-ghost" : "bcc-btn-outline"}`}
                  style={{ flexShrink: 0, fontSize: 12, padding: "3px 10px" }}
                  disabled={isMutating}
                  aria-pressed={isFollowing}
                  aria-label={
                    isFollowing
                      ? `Stop watching ${member.display_name}`
                      : `Watch ${member.display_name}`
                  }
                  onClick={() => handleToggle(member)}
                >
                  {isFollowing ? FOLLOW_COPY.state : FOLLOW_COPY.cta}
                </button>
              </div>
              {failure?.memberId === member.id && (
                <span
                  role="status"
                  className="bcc-mono text-[10px] leading-snug text-[var(--bcc-text-secondary)]"
                >
                  {failure.text}
                </span>
              )}
              {/* Social-proof line — sits below the avatar+name row (not
                  squeezed into it, which used to push the name/handle
                  upward off-center against the avatar). `avatars` is only
                  ever present for the mutual_follows reason code. */}
              {member.suggestion_reason !== null && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {member.suggestion_reason.avatars !== undefined && (
                    <span style={{ display: "flex" }}>
                      {member.suggestion_reason.avatars.map((a, i) => (
                        <span
                          key={a.handle}
                          style={{ marginLeft: i === 0 ? 0 : -6, position: "relative", zIndex: 10 - i }}
                        >
                          <Avatar
                            avatarUrl={a.avatar_url}
                            handle={a.handle}
                            size="xs"
                            className="ring-2 ring-[var(--bcc-surface)]"
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="bcc-mono bcc-text-secondary" style={{ display: "block", fontSize: 11 }}>
                    {member.suggestion_reason.label}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
