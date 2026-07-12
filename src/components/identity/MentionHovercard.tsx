"use client";

/**
 * MentionHovercard — shows the shared `AuthorCard` when a viewer hovers a
 * tagged @handle in post/comment text (same affordance as hovering an
 * avatar). The mention only carries handle + user_id + display name; the
 * card fills in avatar/rank/bio/counts itself via `useUser(handle)`.
 *
 * Wraps its children (the mention `<Link>`) in an inline trigger span and
 * reuses `useHovercard` + `AuthorHoverPanel`, so positioning, portaling,
 * and open/close intent match the avatar hover card exactly.
 */

import { AuthorHoverPanel } from "@/components/identity/AuthorHoverPanel";
import { useHovercard } from "@/hooks/useHovercard";
import { usePrefetchUser } from "@/hooks/useUser";

export function MentionHovercard({
  handle,
  userId,
  displayName,
  children,
}: {
  handle: string;
  userId: number;
  displayName?: string | undefined;
  children: React.ReactNode;
}) {
  const { open, coords, triggerRef, triggerHandlers, popoverHandlers } = useHovercard();
  const prefetchUser = usePrefetchUser();
  const nameText =
    typeof displayName === "string" && displayName !== "" ? displayName : `@${handle}`;

  const onEnter = () => {
    prefetchUser(handle);
    triggerHandlers.onMouseEnter();
  };

  return (
    <span
      ref={triggerRef}
      className="inline"
      onMouseEnter={onEnter}
      onMouseLeave={triggerHandlers.onMouseLeave}
    >
      {children}
      {open && coords !== null && (
        <AuthorHoverPanel
          coords={coords}
          handlers={popoverHandlers}
          label={`${nameText} preview`}
          handle={handle}
          displayName={displayName}
          userId={userId}
          cardTier={null}
          tierLabel={null}
          rankLabel=""
          enabled={open}
        />
      )}
    </span>
  );
}
