"use client";

/**
 * MemberFollowButton — Follow/Following toggle for a member, reused by the
 * author card (hover + sidebar). Wraps the same watch/unwatch wiring the
 * Suggested-members widget uses: one watchlist read builds the follow
 * map, the two granular mutations flip it.
 *
 * Anonymous viewers get no button (watching is auth-only — `useWatching`
 * self-gates and returns nothing), and the self-view is suppressed by the
 * caller (it passes `hidden` once the profile confirms `is_self`).
 */

import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";

import { useWatching } from "@/hooks/useWatching";
import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import { FOLLOW_COPY } from "@/lib/copy";

export function MemberFollowButton({
  userId,
  className = "",
}: {
  userId: number;
  className?: string;
}) {
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const watchingQuery = useWatching({ page_size: 50 });
  const watchMutation = useWatchMutation();
  const unwatchMutation = useUnwatchMutation();

  const entry = useMemo(() => {
    for (const item of watchingQuery.data?.items ?? []) {
      const idKey = item.page_id !== null ? item.page_id : item.card_id;
      if (item.card_kind === "member" && idKey === userId) {
        return { follow_id: item.follow_id, source: item.follow_source ?? "peepso" as const };
      }
    }
    return null;
  }, [watchingQuery.data, userId]);

  const isFollowing = entry !== null;
  const isMutating = watchMutation.isPending || unwatchMutation.isPending;

  const toggle = useCallback(() => {
    if (entry !== null) {
      unwatchMutation.mutate({ follow_id: entry.follow_id, source: entry.source });
    } else {
      watchMutation.mutate({ target_kind: "member", target_id: userId });
    }
  }, [entry, unwatchMutation, watchMutation, userId]);

  // Anon viewers can't follow — the card just drops the control.
  if (!isAuthed) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isMutating}
      aria-pressed={isFollowing}
      className={`bcc-btn bcc-btn-sm ${isFollowing ? "bcc-btn-ghost" : "bcc-btn-outline"} ${className}`}
    >
      {isFollowing ? FOLLOW_COPY.state : FOLLOW_COPY.cta}
    </button>
  );
}
