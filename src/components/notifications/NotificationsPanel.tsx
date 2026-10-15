"use client";

/**
 * NotificationsPanel — the shared §I1 notification list panel.
 *
 * Extracted from NotificationBell.tsx (§11 reuse) so the desktop
 * SiteHeader notifications modal and the mobile bell dropdown render
 * the SAME rows and states instead of forking. The panel owns:
 *   - the list query (useNotifications — only fetches while `open`),
 *   - mark-read on row click + the "Mark all read" bulk action,
 *   - loading / error / empty / load-more states,
 *   - navigation to the server-built `link` (calls `onNavigate` first
 *     so the host surface can close itself).
 *
 * Hosts:
 *   - NotificationBell wraps it in its dropdown chrome (mobile sheet).
 *   - SiteHeader's NotifModal wraps it in the header-modal chrome and
 *     passes showTitle={false} — the modal head already renders a
 *     "Notifications" title + "See all" link, so the panel's own
 *     strip collapses to just the Mark-all action when present.
 *
 * Row rendering, copy, and the unread-count gating for "Mark all
 * read" are verbatim from NotificationBell — do not let the two
 * surfaces drift apart again.
 */

import { useEffect, useRef } from "react";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/identity/Avatar";
import {
  useMarkReadMutation,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import type { NotificationItem } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

interface NotificationsPanelProps {
  /** False for anon — the hooks short-circuit without firing. */
  enabled: boolean;
  /** The list only fetches while the host surface is open. */
  open: boolean;
  /**
   * Render the "NOTIFICATIONS" strip label. Default true (bell
   * dropdown). SiteHeader's modal passes false — its chrome already
   * carries the title.
   */
  showTitle?: boolean;
  /** Called before navigating so the host can close its surface. */
  onNavigate: () => void;
}

export function NotificationsPanel({
  enabled,
  open,
  showTitle = true,
  onNavigate,
}: NotificationsPanelProps) {
  const router = useRouter();

  const unread = useUnreadCount({ enabled });
  const list = useNotifications({ enabled: enabled && open });
  const markRead = useMarkReadMutation();

  const unreadCount = unread.data?.unread_count ?? 0;
  const items: NotificationItem[] = (list.data?.pages ?? []).flatMap((p) => p.items);

  // §γ — copy is keyed on err.code; never render err.message. The
  // previous single hardcoded line is kept as the default, so the
  // common case reads exactly as it did.
  const failureCopy = humanizeCode(
    list.error,
    {
      bcc_unauthorized: "Sign in to read your notifications.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "Notifications are temporarily unavailable. Try again shortly.",
      bcc_permission_denied: "You can’t read these notifications.",
      bcc_forbidden: "You can’t read these notifications.",
      // Third denial code: the control was already withheld for it, but the
      // copy fell through to a default ending in "Try again in a moment".
      bcc_blocked: "You can’t read these notifications.",
    },
    "Couldn’t load notifications. Try again in a moment.",
  );

  // A permission boundary does not move when the cursor does, so pressing
  // Retry against one can only fail the same way. Omitting `onRetry`
  // renders no button at all rather than an inert one.
  const retryIsHonest = !isPermissionDenial(list.error);

  const loadMoreRef = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLParagraphElement | null>(null);
  /** Did LOAD MORE hold focus at the moment it was activated? */
  const heldFocus = useRef(false);

  // When the control the viewer was standing on disappears because the
  // list ended, put them somewhere. ONLY when it held focus: a mouse user
  // scrolling elsewhere must not have the page yanked out from under them,
  // and this never fires on a first render that simply has no next page.
  useEffect(() => {
    if (list.hasNextPage) return;
    if (!heldFocus.current) return;
    heldFocus.current = false;
    endRef.current?.focus();
  }, [list.hasNextPage]);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) {
      markRead.mutate(item.id);
    }
    onNavigate();
    router.push(item.link as Route);
  };

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    markRead.mutate(undefined);
  };

  const showMarkAll = unreadCount >= 3;

  return (
    // Renders directly on the host surface (SiteHeader's
    // .bcc-header-modal glass panel, or NotificationBell's .bcc-panel
    // on mobile) — no background of its own, so loading/empty/list
    // states all sit on ONE consistent surface instead of layering an
    // opaque cardstock block on top.
    <div role="menu" className="flex flex-col gap-px overflow-hidden">
      {(showTitle || showMarkAll) && (
        <div
          className={
            "flex items-center px-4 py-2.5 " +
            (showTitle ? "justify-between" : "justify-end")
          }
        >
          {showTitle && (
            <span className="bcc-mono text-[10px] tracking-[0.2em] text-[var(--bcc-text-secondary)]">
              NOTIFICATIONS
            </span>
          )}
          {showMarkAll && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markRead.isPending}
              className="bcc-mono text-[10px] tracking-[0.16em] normal-case text-[var(--bcc-accent)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--bcc-text-muted)]"
            >
              {markRead.isPending ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>
      )}

      {/* A FIRST load that failed has nothing to keep, so the whole body
          is the failure. The two post-load failures are handled beside the
          rows below, where the rows survive. */}
      {list.isLoadingError ? (
        <div className="px-2 py-2">
          <LoadFailure
            message={failureCopy}
            {...(retryIsHonest ? { onRetry: () => void list.refetch() } : {})}
          />
        </div>
      ) : list.isLoading ? (
        <div className="bcc-mono px-4 py-3 text-[11px] text-[var(--bcc-text-secondary)]">
          Loading…
        </div>
      ) : items.length === 0 && !list.isError ? (
        // Sprint 5 empty-state hygiene: "No notifications yet. We'll
        // let you know when something happens." was the SaaS-dashboard
        // inbox-notify framing ("we'll notify you"). Replaced with
        // "Nothing on file." — the workshop/ledger vocabulary the
        // rest of the product uses (FILE 01-07 frames on profile,
        // "on the books" on halls empty). Observational; no
        // promise; no system-speaking-at-you.
        <div className="bcc-mono px-4 py-6 text-center text-[11px] text-[var(--bcc-text-secondary)]">
          Nothing on file.
        </div>
      ) : (
        <ul role="presentation" className="flex max-h-[60vh] flex-col gap-px overflow-y-auto">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onActivate={() => handleItemClick(item)}
            />
          ))}
          {/* A failed REFRESH is not a failed cursor: the retained pages
              and the cursor taken from the last of them are still
              coherent, so LOAD MORE deliberately stays available below
              and this control refetches. Reachable here in normal use —
              `markRead` and `markAllRead` both invalidate this key, and
              the app-wide `retry: 1` means two consecutive failures
              surface it. */}
          {list.isRefetchError && (
            <li>
              <LoadFailure
                message={failureCopy}
                {...(retryIsHonest ? { onRetry: () => void list.refetch() } : {})}
              />
            </li>
          )}

          {/* Cursor safety: while the NEXT cursor is failed, LOAD MORE is
              WITHDRAWN so it cannot advance past — and so silently skip —
              the page that failed. Retry resumes that same cursor with
              `fetchNextPage()`; it must never be `refetch()`, which would
              re-request every page already loaded. */}
          {list.isFetchNextPageError ? (
            <li>
              <LoadFailure
                message={failureCopy}
                {...(retryIsHonest ? { onRetry: () => void list.fetchNextPage() } : {})}
              />
            </li>
          ) : (
            list.hasNextPage && (
              <li>
                {/* Not `disabled` while fetching: a disabled element is
                    removed from the tab order and the browser blurs it, so
                    disabling the button the viewer just pressed drops focus
                    to <body>. Measured: after activating LOAD MORE,
                    `document.activeElement` was `<body>` and a keyboard
                    user had to tab in from the top of the document to
                    reach it again — at the BOTTOM of a list that had just
                    grown. Focusable + `aria-disabled` + an inert handler
                    keeps focus where the viewer put it. Same reasoning,
                    same shape, as PagerNav's chips. */}
                <button
                  type="button"
                  ref={loadMoreRef}
                  onClick={() => {
                    if (list.isFetchingNextPage) return;
                    // Recorded HERE, not in an effect: by the time an
                    // effect runs the button may already be gone and
                    // `document.activeElement` already `<body>`, so the
                    // one fact we need would be unrecoverable.
                    heldFocus.current =
                      loadMoreRef.current !== null &&
                      document.activeElement === loadMoreRef.current;
                    void list.fetchNextPage();
                  }}
                  aria-disabled={list.isFetchingNextPage || undefined}
                  aria-busy={list.isFetchingNextPage || undefined}
                  className={
                    "bcc-mono w-full px-4 py-2.5 text-center text-[10px] tracking-[0.18em] text-[var(--bcc-accent)] hover:bg-[var(--bcc-surface-hover)]" +
                    (list.isFetchingNextPage ? " cursor-wait" : "")
                  }
                >
                  {list.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
                </button>
              </li>
            )
          )}

          {/* Where focus lands when LOAD MORE legitimately disappears.
              Measured: activating it on the last page removed the focused
              element, and focus fell to `<body>` — at the BOTTOM of a list
              that had just grown, so a keyboard user had to tab in from
              the top of the document to get anywhere.

              Deliberately NOT a live region. This panel has none, and the
              reading happens because focus MOVES here, which is one
              announcement rather than two. */}
          {!list.hasNextPage && !list.isError && (
            <li>
              <p
                ref={endRef}
                tabIndex={-1}
                data-testid="notifications-end-of-list"
                className="bcc-mono px-4 py-2.5 text-center text-[10px] tracking-[0.18em] text-[var(--bcc-text-secondary)]"
              >
                End of the list.
              </p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

interface NotificationRowProps {
  item: NotificationItem;
  onActivate: () => void;
}

function NotificationRow({ item, onActivate }: NotificationRowProps) {
  return (
    <li role="menuitem">
      <button
        type="button"
        onClick={onActivate}
        className={
          "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--bcc-surface-hover)] " +
          (item.read ? "" : "bg-[var(--bcc-accent-subtle)]")
        }
      >
        {!item.read && (
          <span
            aria-hidden
            className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--bcc-accent)" }}
          />
        )}
        {item.read && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0" />}

        {/*
          Sprint 1 Identity Grammar — actor Avatar gives the bell social
          presence. NotificationActor ships handle / display_name /
          avatar_url (types.ts:848-854); rank+tier are NOT on the actor
          view-model so we render the plain Avatar (no tier ring,
          gracefully degrades to initials when avatar_url is empty).
        */}
        <span aria-hidden className="mt-0.5 shrink-0">
          <Avatar
            avatarUrl={item.actor.avatar_url === "" ? null : item.actor.avatar_url}
            handle={item.actor.handle}
            displayName={item.actor.display_name}
            size="sm"
            variant="rounded"
          />
        </span>

        <span className="flex flex-1 flex-col gap-1 overflow-hidden">
          <span className="text-sm text-[var(--bcc-text)]">
            {item.message}
          </span>
          {item.created_at !== "" && (
            <span className="bcc-mono text-[10px] tracking-[0.12em] text-[var(--bcc-text-secondary)]">
              {formatRelativeTime(item.created_at)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
