"use client";

/**
 * MemberFollowButton — Watch / Watching toggle for a member, in the author
 * card (hover + sidebar).
 *
 * F-255: the state comes from the member's PROFILE (`viewer_is_watching` /
 * `viewer_watch` on GET /users/:handle), which the author card already
 * loads. It used to search the first page of /me/watching (50 items), so
 * past the 50th watch the button said "Watch" on someone already watched
 * and could not unwatch them. While the profile is loading, or when it is
 * private to this viewer (403, no fields), the state is unknown: the button
 * is disabled with a reason rather than offering "Watch".
 *
 * Anonymous viewers get no button; the caller suppresses it on one's own
 * card.
 */

import { useSession } from "next-auth/react";

import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { useViewerWatch, WATCH_UNKNOWN_COPY } from "@/hooks/useViewerWatch";
import type { ViewerWatch } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";

export function MemberFollowButton({
  userId,
  name,
  viewerIsWatching,
  viewerWatch,
  className = "",
}: {
  userId: number;
  /** Shown in the accessible name ("Watch Dana Reyes"). */
  name?: string | undefined;
  /** From the member's profile; undefined while it loads or is private. */
  viewerIsWatching?: boolean | null | undefined;
  viewerWatch?: ViewerWatch | null | undefined;
  className?: string;
}) {
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const watch = useViewerWatch(
    {
      card_kind: "member",
      id: userId,
      viewer_is_watching: viewerIsWatching,
      viewer_watch: viewerWatch,
    },
    { onChanged: (now) => captureAnalyticsEvent(now ? "member_followed" : "member_unfollowed") },
  );

  // Anon viewers can't follow — the card just drops the control.
  if (!isAuthed) return null;

  const who = name !== undefined && name !== "" ? ` ${name}` : "";

  // Same shape as AuthorVouchButton's card variant, its neighbour in the
  // AuthorCard row: the caller's className sizes the wrapper, the button
  // fills it, and the line sits underneath.
  return (
    <span className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={watch.toggle}
        disabled={watch.pending || watch.unknown}
        aria-pressed={watch.unknown ? undefined : watch.watching}
        aria-label={watch.watching ? `Stop watching${who}` : `Watch${who}`}
        title={watch.unknown ? WATCH_UNKNOWN_COPY : undefined}
        className={`bcc-btn bcc-btn-sm w-full ${watch.watching ? "bcc-btn-ghost" : "bcc-btn-outline"}`}
      >
        {watch.watching ? FOLLOW_COPY.state : FOLLOW_COPY.cta}
      </button>
      {watch.error !== null && (
        <span
          role="status"
          className="bcc-mono text-[10px] leading-snug text-[var(--bcc-text-secondary)]"
        >
          {watch.error}
        </span>
      )}
    </span>
  );
}
