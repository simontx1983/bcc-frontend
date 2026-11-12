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

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { useWatching } from "@/hooks/useWatching";
import { useWatchMutation, useUnwatchMutation, watchErrorCopy } from "@/hooks/useWatch";
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
  // F-236: a refused or failed toggle used to do nothing visible. The line
  // is keyed on the error code (never err.message) and clears on the next
  // click or a success.
  const [errorText, setErrorText] = useState<string | null>(null);

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
    setErrorText(null);
    if (entry !== null) {
      unwatchMutation.mutate(
        { follow_id: entry.follow_id, source: entry.source },
        {
          onSuccess: () => captureFollowEvent("member_unfollowed"),
          onError: (err) => setErrorText(watchErrorCopy(err, "unwatch")),
        },
      );
    } else {
      watchMutation.mutate(
        { target_kind: "member", target_id: userId },
        {
          onSuccess: () => captureFollowEvent("member_followed"),
          onError: (err) => setErrorText(watchErrorCopy(err, "watch")),
        },
      );
    }
  }, [entry, unwatchMutation, watchMutation, userId]);

  // Anon viewers can't follow — the card just drops the control.
  if (!isAuthed) return null;

  // Same shape as AuthorVouchButton's card variant, its neighbour in the
  // AuthorCard row: the caller's className sizes the wrapper, the button
  // fills it, and the line sits underneath.
  return (
    <span className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={isMutating}
        aria-pressed={isFollowing}
        className={`bcc-btn bcc-btn-sm w-full ${isFollowing ? "bcc-btn-ghost" : "bcc-btn-outline"}`}
      >
        {isFollowing ? FOLLOW_COPY.state : FOLLOW_COPY.cta}
      </button>
      {errorText !== null && (
        <span
          role="status"
          className="bcc-mono text-[10px] leading-snug text-[var(--bcc-text-secondary)]"
        >
          {errorText}
        </span>
      )}
    </span>
  );
}

function captureFollowEvent(event: "member_followed" | "member_unfollowed") {
  captureAnalyticsEvent(event);
}
